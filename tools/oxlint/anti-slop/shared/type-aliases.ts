import type { ESTree } from "@oxlint/plugins";

import { walkNodes, type VisitorKeys } from "./node-walk.ts";

/**
 * Collect every type alias in a file, including those declared inside a function body,
 * block, namespace or `declare module`. Callers resolve these by name alone, so a name
 * declared in more than one scope is dropped rather than resolved across scopes.
 */
export function collectTypeAliases(
	program: ESTree.Program,
	visitorKeys: VisitorKeys,
): ReadonlyMap<string, ESTree.TSTypeAliasDeclaration> {
	const aliases = new Map<string, ESTree.TSTypeAliasDeclaration>();
	const duplicated = new Set<string>();
	walkNodes(program, visitorKeys, (node) => {
		if (node.type !== "TSTypeAliasDeclaration") return;
		const name = node.id.name;
		if (duplicated.has(name)) return;
		if (aliases.has(name)) {
			aliases.delete(name);
			duplicated.add(name);
			return;
		}
		aliases.set(name, node);
	});
	return aliases;
}

/**
 * The alias name a type reference names, or null when the type is not a bare reference.
 * A reference that applies type arguments is not a bare alias, so it resolves to null.
 */
export function referencedAliasName(type: ESTree.TSType): string | null {
	if (type.type === "TSParenthesizedType") return referencedAliasName(type.typeAnnotation);
	if (type.type !== "TSTypeReference" || type.typeName.type !== "Identifier") return null;
	return type.typeArguments === null ||
		type.typeArguments === undefined ||
		type.typeArguments.params.length === 0
		? type.typeName.name
		: null;
}
