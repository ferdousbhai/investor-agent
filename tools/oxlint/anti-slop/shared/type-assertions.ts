import type { ESTree } from "@oxlint/plugins";

export type TypeAssertionExpression = ESTree.TSAsExpression | ESTree.TSTypeAssertion;

/** Whether an assertion is `as const`, which narrows rather than discarding type evidence. */
export function isConstAssertion(node: TypeAssertionExpression): boolean {
	const { typeAnnotation } = node;
	return (
		typeAnnotation.type === "TSTypeReference" &&
		typeAnnotation.typeName.type === "Identifier" &&
		typeAnnotation.typeName.name === "const"
	);
}
