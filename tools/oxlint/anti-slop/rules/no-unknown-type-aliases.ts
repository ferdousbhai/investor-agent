import { defineRule } from "@oxlint/plugins";

import { shadowedTypeNames } from "../shared/shadowed-type-names.ts";
import { referencedAliasName } from "../shared/type-nodes.ts";

import type { ESTree } from "@oxlint/plugins";

export const noUnknownTypeAliasesRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow type aliases whose resolved type is unknown; unknown must remain visible at an allowed boundary.",
		},
		messages: {
			unknownAlias:
				"Type alias `{{alias}}` hides `unknown`. Keep `unknown` explicit at the parsing boundary or on an allowed `cause` field; otherwise use the parsed owner type.",
		},
	},
	createOnce(context) {
		const aliases = new Map<string, ESTree.TSTypeAliasDeclaration>();

		const resolvesToUnknown = (
			type: ESTree.TSType,
			shadowedAliases: ReadonlySet<string>,
			visited = new Set<string>(),
		): boolean => {
			if (type.type === "TSUnknownKeyword") return true;
			if (type.type === "TSParenthesizedType")
				return resolvesToUnknown(type.typeAnnotation, shadowedAliases, visited);
			const name = referencedAliasName(type);
			if (name === null || visited.has(name) || shadowedAliases.has(name)) return false;
			const alias = aliases.get(name);
			if (
				alias === undefined ||
				(alias.typeParameters !== null && alias.typeParameters !== undefined)
			) {
				return false;
			}
			const nextVisited = new Set(visited);
			nextVisited.add(name);
			return resolvesToUnknown(alias.typeAnnotation, shadowedAliases, nextVisited);
		};

		return {
			Program(node) {
				aliases.clear();
				for (const statement of node.body) {
					const declaration =
						statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
					if (declaration?.type === "TSTypeAliasDeclaration") {
						aliases.set(declaration.id.name, declaration);
					}
				}
				for (const alias of aliases.values()) {
					// A generic alias binds its own parameters over its right-hand side, so `type
					// Boxed<Draft> = Draft` means the parameter and not a same-named top-level alias.
					// This rule reads Program-level aliases, so its own parameters are the only
					// names that can shadow here, which is why an enclosing-scope fix missed it.
					if (
						!resolvesToUnknown(
							alias.typeAnnotation,
							shadowedTypeNames(alias.typeAnnotation, context.sourceCode.visitorKeys),
							new Set([alias.id.name]),
						)
					) {
						continue;
					}
					context.report({
						node: alias.id,
						messageId: "unknownAlias",
						data: { alias: alias.id.name },
					});
				}
			},
		};
	},
});
