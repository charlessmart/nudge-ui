import type { ESTree } from "@oxlint/plugins";
import { describe, expect, it } from "vitest";

import { requireSafetyCommentForTypeAssertionRule } from "./require-safety-comment-for-type-assertion.ts";

type Report = { readonly messageId?: string };

function identifier(name: string): ESTree.IdentifierReference {
  return {
    type: "Identifier",
    name,
    start: 0,
    end: name.length,
  } as unknown as ESTree.IdentifierReference;
}

function typeReference(name: string): ESTree.TSTypeReference {
  return {
    type: "TSTypeReference",
    typeName: identifier(name),
    start: 0,
    end: name.length,
  } as unknown as ESTree.TSTypeReference;
}

function assertion(expression: ESTree.Expression, typeName = "Target"): ESTree.TSAsExpression {
  return {
    type: "TSAsExpression",
    expression,
    typeAnnotation: typeReference(typeName),
    start: 10,
    end: 30,
  } as unknown as ESTree.TSAsExpression;
}

function attachToDeclaration(node: ESTree.Node): void {
  const program = { type: "Program" } as ESTree.Program;
  const declaration = {
    type: "VariableDeclaration",
    parent: program,
  } as ESTree.VariableDeclaration;
  node.parent = declaration;
}

function runRule(
  nodes: readonly ESTree.TSAsExpression[],
  comments: readonly { readonly value: string; readonly end: number }[] = [],
): Report[] {
  const reports: Report[] = [];
  const rule = requireSafetyCommentForTypeAssertionRule as unknown as {
    createOnce(context: unknown): {
      TSAsExpression(node: ESTree.TSAsExpression): void;
    };
  };
  const visitors = rule.createOnce({
    report(report: Report) {
      reports.push(report);
    },
    sourceCode: {
      getCommentsBefore() {
        return comments;
      },
    },
  });

  for (const node of nodes) visitors.TSAsExpression(node);
  return reports;
}

describe("require-safety-comment-for-type-assertion", () => {
  it("reports a standalone assertion without a SAFETY comment", () => {
    const node = assertion(identifier("value"));
    attachToDeclaration(node);

    expect(runRule([node])).toEqual([
      expect.objectContaining({ messageId: "missingSafetyComment" }),
    ]);
  });

  it("accepts a standalone assertion with a SAFETY comment", () => {
    const node = assertion(identifier("value"));
    attachToDeclaration(node);

    expect(runRule([node], [{ value: " SAFETY: validated by the owner schema.", end: 5 }]))
      .toEqual([]);
  });

  it("accepts const assertions without a comment", () => {
    const node = assertion(identifier("value"), "const");
    attachToDeclaration(node);

    expect(runRule([node])).toEqual([]);
  });

  it("leaves every member of an assertion chain to no-chained-type-assertions", () => {
    const inner = assertion(identifier("value"), "unknown");
    const outer = assertion(inner);
    inner.parent = outer;
    attachToDeclaration(outer);

    expect(runRule([inner, outer])).toEqual([]);
  });

  it("recognizes assertion chains separated by parentheses", () => {
    const inner = assertion(identifier("value"), "unknown");
    const parentheses = {
      type: "ParenthesizedExpression",
      expression: inner,
      start: inner.start,
      end: inner.end,
    } as ESTree.ParenthesizedExpression;
    const outer = assertion(parentheses);
    inner.parent = parentheses;
    parentheses.parent = outer;
    attachToDeclaration(outer);

    expect(runRule([inner, outer])).toEqual([]);
  });
});
