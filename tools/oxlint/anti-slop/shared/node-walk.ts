import type { ESTree } from "@oxlint/plugins";

export type VisitorKeys = Readonly<Record<string, readonly string[]>>;

function isNode(value: unknown): value is ESTree.Node {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		typeof value.type === "string"
	);
}

/** Visit a node and every descendant the parser's visitor keys reach. */
export function walkNodes(
	node: ESTree.Node,
	visitorKeys: VisitorKeys,
	visit: (node: ESTree.Node) => void,
): void {
	visit(node);
	const record = node as unknown as Readonly<Record<string, unknown>>;
	for (const key of visitorKeys[node.type] ?? []) {
		const value = record[key];
		if (isNode(value)) {
			walkNodes(value, visitorKeys, visit);
			continue;
		}
		if (!Array.isArray(value)) continue;
		for (const child of value) {
			if (isNode(child)) walkNodes(child, visitorKeys, visit);
		}
	}
}
