import { parse } from "@babel/parser";

export type SyntaxNode = {
  type: string;
  [key: string]: unknown;
};

export const SKIP_KEYS = new Set([
  "type",
  "loc",
  "range",
  "start",
  "end",
  "extra",
  "leadingComments",
  "trailingComments",
  "innerComments",
]);

export function isNode(value: unknown): value is SyntaxNode {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, "type") === "string";
}

export function forEachChild(
  node: SyntaxNode,
  visit: (child: SyntaxNode, key: string) => void,
): void {
  for (const [key, value] of Object.entries(node)) {
    if (SKIP_KEYS.has(key)) continue;
    if (isNode(value)) {
      visit(value, key);
      continue;
    }
    if (!Array.isArray(value)) continue;
    for (const child of value) {
      if (isNode(child)) visit(child, key);
    }
  }
}

export function childNodes(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  forEachChild(node, (child) => children.push(child));
  return children;
}

export function identifier(node: unknown): string | null {
  if (!isNode(node) || (node.type !== "Identifier" && node.type !== "StringLiteral")) return null;
  return typeof node.name === "string" ? node.name : typeof node.value === "string" ? node.value : null;
}

export function jsxMemberName(node: unknown): string | null {
  if (!isNode(node)) return null;
  if (node.type === "JSXIdentifier") return typeof node.name === "string" ? node.name : null;
  if (node.type !== "JSXMemberExpression") return null;
  const object = jsxMemberName(node.object);
  const property = jsxMemberName(node.property);
  return object && property ? `${object}.${property}` : null;
}

export function elementName(node: unknown): string | null {
  if (!isNode(node)) return null;
  if (node.type === "Identifier") return typeof node.name === "string" ? node.name : null;
  return jsxMemberName(node);
}

export function parseModule(code: string): SyntaxNode | null {
  try {
    return parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    }) as unknown as SyntaxNode;
  } catch {
    return null;
  }
}
