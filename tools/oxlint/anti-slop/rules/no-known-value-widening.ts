import { defineRule } from "@oxlint/plugins";

import {
	classifyWideningTarget,
	createTypeEnvironment,
	isKnownEvidenceExpression,
	type TypeEnvironment,
	type WideningTargetKind,
} from "../shared/dictionary-types.ts";

import { resolveVariable } from "../shared/scope.ts";
import { shadowedTypeNames } from "../shared/shadowed-type-names.ts";

import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";

type FunctionExpression = ESTree.ArrowFunctionExpression | ESTree.Function;

function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (
		current.type === "ParenthesizedExpression" ||
		current.type === "TSAsExpression" ||
		current.type === "TSSatisfiesExpression" ||
		current.type === "TSTypeAssertion" ||
		current.type === "TSNonNullExpression"
	) {
		current = current.expression;
	}
	return current;
}

function variableDeclarator(variable: Variable): ESTree.VariableDeclarator | null {
	if (variable.defs.length !== 1) return null;
	const [definition] = variable.defs;
	return definition?.type === "Variable" && definition.node.type === "VariableDeclarator"
		? definition.node
		: null;
}

function isStableConstVariable(variable: Variable, declarator: ESTree.VariableDeclarator): boolean {
	return (
		declarator.parent.type === "VariableDeclaration" &&
		declarator.parent.kind === "const" &&
		variable.references.every((reference) => reference.init || !reference.isWrite())
	);
}

function hasKnownEvidence(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	visitedVariables = new Set<Variable>(),
): boolean {
	if (isKnownEvidenceExpression(expression)) return true;
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.type !== "Identifier") return false;
	const variable = resolveVariable(sourceCode, unwrapped);
	if (variable === null || visitedVariables.has(variable)) return false;
	const declarator = variableDeclarator(variable);
	if (
		declarator === null ||
		declarator.init === null ||
		!isStableConstVariable(variable, declarator)
	) {
		return false;
	}
	visitedVariables.add(variable);
	return hasKnownEvidence(sourceCode, declarator.init, visitedVariables);
}

function annotationTarget(
	annotation: ESTree.TSTypeAnnotation | null | undefined,
	environment: TypeEnvironment,
	shadowedNames: ReadonlySet<string>,
): WideningTargetKind | null {
	return annotation === null || annotation === undefined
		? null
		: classifyWideningTarget(annotation.typeAnnotation, environment, shadowedNames);
}

function enclosingFunction(node: ESTree.Node): FunctionExpression | null {
	let current: ESTree.Node | null = node.parent;
	while (current !== null && current.type !== "Program") {
		if (
			current.type === "ArrowFunctionExpression" ||
			current.type === "FunctionDeclaration" ||
			current.type === "FunctionExpression"
		) {
			return current;
		}
		current = current.parent;
	}
	return null;
}

function sourceKeyName(sourceCode: SourceCode, key: ESTree.PropertyKey): string {
	if (key.type === "Identifier" || key.type === "PrivateIdentifier") return key.name;
	if (key.type === "Literal") return String(key.value);
	return sourceCode.getText(key);
}

function functionName(sourceCode: SourceCode, owner: FunctionExpression | null): string {
	if (owner === null) return "anonymous function";
	if (owner.id !== null) return owner.id.name;
	const parent = owner.parent;
	if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier")
		return parent.id.name;
	if (parent.type === "MethodDefinition") return sourceKeyName(sourceCode, parent.key);
	return "anonymous function";
}

function isEmptyObjectExpression(expression: ESTree.Expression): boolean {
	const unwrapped = unwrapExpression(expression);
	return unwrapped.type === "ObjectExpression" && unwrapped.properties.length === 0;
}

function isDictionaryAccumulatorTarget(destination: WideningTargetKind): boolean {
	return destination === "open dictionary" || destination === "generic container";
}

function hasParentAssertion(node: ESTree.Node): boolean {
	return node.parent?.type === "TSAsExpression" || node.parent?.type === "TSTypeAssertion";
}

export const noKnownValueWideningRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow syntactically established values from flowing into explicitly broad or anonymous target types that discard useful evidence.",
		},
		messages: {
			widening:
				"The explicit {{target}} type on {{subject}} discards known type evidence. Keep inference, validate with `satisfies`, or use a named owner contract.",
		},
	},
	createOnce(context) {
		let environment: TypeEnvironment | null = null;

		const reportFlow = (
			expression: ESTree.Expression,
			destination: WideningTargetKind | null,
			subject: string,
		) => {
			if (destination === null) return;
			if (
				isDictionaryAccumulatorTarget(destination) &&
				isEmptyObjectExpression(expression)
			) {
				return;
			}
			if (!hasKnownEvidence(context.sourceCode, expression)) return;
			context.report({
				node: expression,
				messageId: "widening",
				data: { subject, target: destination },
			});
		};

		const checkProperty = (node: ESTree.PropertyDefinition | ESTree.AccessorProperty) => {
			if (node.value === null) return;
			reportFlow(
				node.value,
				targetFromAnnotation(node.typeAnnotation),
				`property \`${sourceKeyName(context.sourceCode, node.key)}\``,
			);
		};

		const checkAssertion = (node: ESTree.TSAsExpression | ESTree.TSTypeAssertion) => {
			if (environment === null || hasParentAssertion(node)) return;
			reportFlow(
				node.expression,
				classifyWideningTarget(
					node.typeAnnotation,
					environment,
					shadowedTypeNames(node, context.sourceCode.visitorKeys),
				),
				"assertion",
			);
		};

		const targetFromAnnotation = (annotation: ESTree.TSTypeAnnotation | null | undefined) =>
			environment === null || annotation === null || annotation === undefined
				? null
				: annotationTarget(
						annotation,
						environment,
						shadowedTypeNames(annotation, context.sourceCode.visitorKeys),
					);

		return {
			Program(node) {
				environment = createTypeEnvironment(node);
			},
			VariableDeclarator(node) {
				if (node.init === null || node.id.type !== "Identifier") return;
				reportFlow(
					node.init,
					targetFromAnnotation(node.id.typeAnnotation),
					`binding \`${node.id.name}\``,
				);
			},
			PropertyDefinition: checkProperty,
			AccessorProperty: checkProperty,
			AssignmentExpression(node) {
				if (node.operator !== "=" || node.left.type !== "Identifier") return;
				const variable = resolveVariable(context.sourceCode, node.left);
				if (variable === null) return;
				const declarator = variableDeclarator(variable);
				if (declarator === null || declarator.id.type !== "Identifier") return;
				reportFlow(
					node.right,
					targetFromAnnotation(declarator.id.typeAnnotation),
					`binding \`${declarator.id.name}\``,
				);
			},
			ReturnStatement(node) {
				if (node.argument === null) return;
				const owner = enclosingFunction(node);
				reportFlow(
					node.argument,
					targetFromAnnotation(owner?.returnType),
					`return value of \`${functionName(context.sourceCode, owner)}\``,
				);
			},
			ArrowFunctionExpression(node) {
				if (node.body.type === "BlockStatement") return;
				reportFlow(
					node.body,
					targetFromAnnotation(node.returnType),
					`return value of \`${functionName(context.sourceCode, node)}\``,
				);
			},
			TSAsExpression: checkAssertion,
			TSTypeAssertion: checkAssertion,
		};
	},
});
