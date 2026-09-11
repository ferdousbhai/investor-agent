import type { ESTree } from "@oxlint/plugins";

import { lexicalTypeParameterNames } from "./lexical-type-parameters.ts";

type VisitorKeys = Readonly<Record<string, readonly string[]>>;

function declaredTypeName(statement: ESTree.Directive | ESTree.Statement): string | null {
	const declaration =
		statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
	return declaration?.type === "TSTypeAliasDeclaration" ||
		declaration?.type === "TSInterfaceDeclaration"
		? declaration.id.name
		: null;
}

// Type names bound by an enclosing scope: type parameters, plus aliases and interfaces declared
// inside a block or module body. The rules' alias tables only hold Program-level declarations, so
// resolving one of these names against those tables would apply an unrelated top-level type.
export function shadowedTypeNames(
	node: ESTree.Node,
	visitorKeys: VisitorKeys,
): ReadonlySet<string> {
	const names = new Set(lexicalTypeParameterNames(node, visitorKeys));
	let current: ESTree.Node | null = node;
	while (current !== null && current.type !== "Program") {
		if (current.type === "BlockStatement" || current.type === "TSModuleBlock") {
			for (const statement of current.body) {
				const name = declaredTypeName(statement);
				if (name !== null) names.add(name);
			}
		}
		current = current.parent;
	}
	return names;
}
