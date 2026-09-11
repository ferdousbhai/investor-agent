import type { ESTree } from "@oxlint/plugins";

/** Strip the parentheses wrapping an expression. */
export function unwrapParentheses(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (current.type === "ParenthesizedExpression") {
		current = current.expression;
	}
	return current;
}

/**
 * Strip the parentheses and the type-only wrappers — `as`, `satisfies`, angle-bracket
 * assertions and `!` — that leave the underlying runtime expression unchanged.
 */
export function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
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
