import { parse } from "@babel/parser";

/** The subset of Babel nodes needed by the host-neutral compiler. */
export type SyntaxNode = {
  type: string;
  [key: string]: unknown;
};

/** Node keys that never hold children worth visiting. */
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

/** Visit every child node with the property name it was reached through. */
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

/** Dotted name for a JSX element name: `A`, `A.B`, `A.B.C`. */
export function jsxMemberName(node: unknown): string | null {
  if (!isNode(node)) return null;
  if (node.type === "JSXIdentifier") return typeof node.name === "string" ? node.name : null;
  if (node.type !== "JSXMemberExpression") return null;
  const object = jsxMemberName(node.object);
  const property = jsxMemberName(node.property);
  return object && property ? `${object}.${property}` : null;
}

/** Dotted name for an identifier expression or a JSX element name. */
export function elementName(node: unknown): string | null {
  if (!isNode(node)) return null;
  if (node.type === "Identifier") return typeof node.name === "string" ? node.name : null;
  return jsxMemberName(node);
}

/** Parse module source, returning `null` when the source is not parseable. */
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
