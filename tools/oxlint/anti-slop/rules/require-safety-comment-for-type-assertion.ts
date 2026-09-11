import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import {
  isConstAssertion,
  type TypeAssertionExpression,
} from "../shared/type-assertions.ts";

const SAFETY_PATTERN = /\bSAFETY\s*:/u;

const commentOwnerKinds = new Set([
  "ExpressionStatement",
  "PropertyDefinition",
  "ReturnStatement",
  "ThrowStatement",
  "VariableDeclaration",
]);

function hasSafetyComment(sourceCode: SourceCode, node: TypeAssertionExpression): boolean {
  const hasSafetyBefore = (target: ESTree.Node) =>
    sourceCode
      .getCommentsBefore(target)
      .some((comment) => comment.end <= node.start && SAFETY_PATTERN.test(comment.value));

  let current: ESTree.Node = node;
  while (true) {
    if (hasSafetyBefore(current)) return true;
    if (commentOwnerKinds.has(current.type)) {
      const { parent } = current;
      if (parent.type === "ExportNamedDeclaration" || parent.type === "ExportDefaultDeclaration") {
        return hasSafetyBefore(parent);
      }
      return false;
    }
    if (current.parent.type === "Program") return false;
    current = current.parent;
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
