import type { ESTree } from "@oxlint/plugins";

export type TypeAssertion = ESTree.TSAsExpression | ESTree.TSTypeAssertion;

export function typeReferenceName(type: ESTree.TSTypeReference): string | null {
	return type.typeName.type === "Identifier" ? type.typeName.name : null;
}

export function unwrapParentheses(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (current.type === "ParenthesizedExpression") {
		current = current.expression;
	}
	return current;
}

export function referencedAliasName(type: ESTree.TSType): string | null {
	if (type.type === "TSParenthesizedType") return referencedAliasName(type.typeAnnotation);
	if (type.type !== "TSTypeReference" || type.typeName.type !== "Identifier") return null;
	return type.typeArguments === null ||
		type.typeArguments === undefined ||
		type.typeArguments.params.length === 0
		? type.typeName.name
		: null;
}

export function isConstAssertion(node: TypeAssertion): boolean {
	return (
		node.typeAnnotation.type === "TSTypeReference" &&
		node.typeAnnotation.typeName.type === "Identifier" &&
		node.typeAnnotation.typeName.name === "const"
	);
}
