import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import {
  isConstAssertion,
  type TypeAssertionExpression,
} from "../shared/type-assertions.ts";

const SAFETY_PATTERN = /\bSAFETY\s*:/u;

// The walk must stop at the statement list holding the assertion's own statement:
// climbing further would let one comment above a function justify every assertion
// inside it.
const statementListContainers = new Set([
  "BlockStatement",
  "ClassBody",
  "Program",
  "StaticBlock",
  "SwitchCase",
  "TSModuleBlock",
]);

function hasSafetyComment(sourceCode: SourceCode, node: TypeAssertionExpression): boolean {
  const hasSafetyBefore = (target: ESTree.Node) =>
    sourceCode
      .getCommentsBefore(target)
      .some((comment) => comment.end <= node.start && SAFETY_PATTERN.test(comment.value));

  let current: ESTree.Node = node;
  while (true) {
    if (hasSafetyBefore(current)) return true;
    const parent: ESTree.Node | null = current.parent;
    if (parent === null || statementListContainers.has(parent.type)) return false;
    current = parent;
  }
}

/** Require every non-const type assertion to state the invariant TypeScript cannot express. */
export const requireSafetyCommentForTypeAssertionRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a nearby SAFETY comment for every TypeScript type assertion except const assertions.",
    },
    messages: {
      missingSafetyComment:
        "This type assertion has no `SAFETY:` justification. State the checked invariant immediately before the assertion or its containing statement.",
    },
  },
  createOnce(context) {
    const checkAssertion = (node: TypeAssertionExpression) => {
      if (isConstAssertion(node) || hasSafetyComment(context.sourceCode, node)) return;
      context.report({ node, messageId: "missingSafetyComment" });
    };

    return {
      TSAsExpression: checkAssertion,
      TSTypeAssertion: checkAssertion,
    };
  },
});
