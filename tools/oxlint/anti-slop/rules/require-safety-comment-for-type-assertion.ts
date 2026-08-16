import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

type TypeAssertion = ESTree.TSAsExpression | ESTree.TSTypeAssertion;

const commentOwnerKinds = new Set([
  "ExpressionStatement",
  "PropertyDefinition",
  "ReturnStatement",
  "ThrowStatement",
  "VariableDeclaration",
]);

function isConstAssertion(node: TypeAssertion): boolean {
  return (
    node.typeAnnotation.type === "TSTypeReference" &&
    node.typeAnnotation.typeName.type === "Identifier" &&
    node.typeAnnotation.typeName.name === "const"
  );
}

function isTypeAssertion(node: ESTree.Node): node is TypeAssertion {
  return node.type === "TSAsExpression" || node.type === "TSTypeAssertion";
}

function unwrapParentheses(expression: ESTree.Expression): ESTree.Expression {
  let current = expression;
  while (current.type === "ParenthesizedExpression") {
    current = current.expression;
  }
  return current;
}

/**
 * Assertion chains are owned by `no-chained-type-assertions`. A SAFETY comment
 * must not become an escape hatch for a construct that the companion rule asks
 * the author to remove.
 */
function isPartOfAssertionChain(node: TypeAssertion): boolean {
  if (isTypeAssertion(unwrapParentheses(node.expression))) return true;

  let current: ESTree.Node = node;
  let parent = node.parent;
  while (parent.type === "ParenthesizedExpression" && parent.expression === current) {
    current = parent;
    parent = parent.parent;
  }

  return isTypeAssertion(parent) && parent.expression === current;
}

function hasSafetyComment(sourceCode: SourceCode, node: TypeAssertion): boolean {
  let current: ESTree.Node = node;
  while (true) {
    if (
      sourceCode
        .getCommentsBefore(current)
        .some((comment) => comment.end <= node.start && /\bSAFETY\s*:/u.test(comment.value))
    ) {
      return true;
    }
    if (commentOwnerKinds.has(current.type) || current.parent.type === "Program") return false;
    current = current.parent;
  }
}

/** Require every standalone non-const assertion to state the invariant TypeScript cannot express. */
export const requireSafetyCommentForTypeAssertionRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a nearby SAFETY comment for standalone TypeScript assertions; assertion chains are rejected by the companion rule.",
    },
    messages: {
      missingSafetyComment:
        "This type assertion has no `SAFETY:` justification. State the checked invariant immediately before the assertion or its containing statement.",
    },
  },
  createOnce(context) {
    const checkAssertion = (node: TypeAssertion) => {
      if (
        isConstAssertion(node) ||
        isPartOfAssertionChain(node) ||
        hasSafetyComment(context.sourceCode, node)
      ) {
        return;
      }
      context.report({ node, messageId: "missingSafetyComment" });
    };

    return {
      TSAsExpression: checkAssertion,
      TSTypeAssertion: checkAssertion,
    };
  },
});
