import { forEachChild, isNode, type SyntaxNode as Node } from "./ast.ts";
import type { StyleProvenance, StyleProvenanceKind } from "./styleProvenanceFormat.ts";

const MAX_SOURCE_LENGTH = 160;

// react-native-web renames these before writing inline styles (`StyleSheet/preprocess.js`).
const REACT_NATIVE_PROPERTIES: Readonly<Record<string, string>> = {
  borderBottomEndRadius: "borderEndEndRadius",
  borderBottomStartRadius: "borderEndStartRadius",
  borderTopEndRadius: "borderStartEndRadius",
  borderTopStartRadius: "borderStartStartRadius",
  borderEndColor: "borderInlineEndColor",
  borderEndStyle: "borderInlineEndStyle",
  borderEndWidth: "borderInlineEndWidth",
  borderStartColor: "borderInlineStartColor",
  borderStartStyle: "borderInlineStartStyle",
  borderStartWidth: "borderInlineStartWidth",
  end: "insetInlineEnd",
  marginEnd: "marginInlineEnd",
  marginHorizontal: "marginInline",
  marginStart: "marginInlineStart",
  marginVertical: "marginBlock",
  paddingEnd: "paddingInlineEnd",
  paddingHorizontal: "paddingInline",
  paddingStart: "paddingInlineStart",
  paddingVertical: "paddingBlock",
  start: "insetInlineStart",
};

/** Maps an authored style key to the CSS property name the DOM reports for it. */
export function cssPropertyForStyleKey(key: string): string {
  if (key.startsWith("--")) return key;
  const standard = REACT_NATIVE_PROPERTIES[key] ?? key;
  const kebab = standard.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return /^(webkit|moz|ms|o)-/.test(kebab) ? `-${kebab}` : kebab;
}

/** Names bound to `StyleSheet.create(...)` anywhere in the module; their members compile to classes, not inline styles. */
export function compiledStyleSheetNames(ast: Node): Set<string> {
  const names = new Set<string>();
  const visit = (node: Node): void => {
    if (node.type === "VariableDeclarator") {
      const id = node.id as { type?: string; name?: string } | undefined;
      if (id?.type === "Identifier" && id.name && isStyleSheetCreate(node.init)) names.add(id.name);
    }
    forEachChild(node, visit);
  };
  visit(ast);
  return names;
}

function isStyleSheetCreate(node: unknown): boolean {
  if (!isNode(node) || node.type !== "CallExpression") return false;
  const callee = node.callee as Node | undefined;
  return callee?.type === "MemberExpression"
    && (callee.object as { name?: string } | undefined)?.name === "StyleSheet"
    && (callee.property as { name?: string } | undefined)?.name === "create";
}

function sourceText(code: string, node: Node): string {
  const start = node.start as number | undefined;
  const end = node.end as number | undefined;
  if (typeof start !== "number" || typeof end !== "number") return "";
  const text = code.slice(start, end).replace(/\s+/g, " ").trim();
  return text.length > MAX_SOURCE_LENGTH ? `${text.slice(0, MAX_SOURCE_LENGTH - 1)}…` : text;
}

function isLiteralValue(node: Node): boolean {
  if (node.type === "StringLiteral" || node.type === "NumericLiteral") return true;
  if (node.type === "TemplateLiteral") return ((node.expressions as unknown[] | undefined) ?? []).length === 0;
  if (node.type === "UnaryExpression" && (node.operator === "-" || node.operator === "+")) {
    return (node.argument as Node | undefined)?.type === "NumericLiteral";
  }
  return false;
}

function propertyKey(property: Node): string | null {
  if (property.computed) return null;
  const key = property.key as Node | undefined;
  if (key?.type === "Identifier") return String(key.name);
  if (key?.type === "StringLiteral") return String(key.value);
  return null;
}

function isCompiledReference(node: Node, compiled: ReadonlySet<string>): boolean {
  let object: Node | undefined = node;
  while (object?.type === "MemberExpression") object = object.object as Node | undefined;
  return object?.type === "Identifier" && (object.name === "StyleSheet" || compiled.has(String(object.name)));
}

const TRANSPARENT_WRAPPERS = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "ParenthesizedExpression",
]);

function collect(
  node: Node,
  conditional: boolean,
  out: StyleProvenance,
  code: string,
  compiled: ReadonlySet<string>,
): void {
  if (TRANSPARENT_WRAPPERS.has(node.type)) {
    const inner = node.expression as Node | undefined;
    if (inner) collect(inner, conditional, out, code, compiled);
    return;
  }
  switch (node.type) {
    case "NullLiteral":
    case "BooleanLiteral":
      return;
    case "Identifier":
      if (node.name !== "undefined") out.opaque.push(sourceText(code, node));
      return;
    case "MemberExpression":
      if (!isCompiledReference(node, compiled)) out.opaque.push(sourceText(code, node));
      return;
    case "ArrayExpression":
      for (const element of (node.elements as Array<Node | null>) ?? []) {
        if (element) collect(element.type === "SpreadElement" ? element.argument as Node : element, conditional, out, code, compiled);
      }
      return;
    case "LogicalExpression": {
      const right = node.right as Node;
      if (node.operator !== "&&") collect(node.left as Node, true, out, code, compiled);
      collect(right, true, out, code, compiled);
      return;
    }
    case "ConditionalExpression":
      collect(node.consequent as Node, true, out, code, compiled);
      collect(node.alternate as Node, true, out, code, compiled);
      return;
    case "ArrowFunctionExpression": {
      // `Pressable` style functions: an expression body is read like any style value, but it varies with state.
      const body = node.body as Node;
      if (body.type === "BlockStatement") out.opaque.push(sourceText(code, node));
      else collect(body, true, out, code, compiled);
      return;
    }
    case "ObjectExpression":
      for (const property of (node.properties as Node[]) ?? []) {
        if (property.type === "SpreadElement") {
          collect(property.argument as Node, conditional, out, code, compiled);
          continue;
        }
        const key = property.type === "ObjectProperty" ? propertyKey(property) : null;
        const value = property.value as Node | undefined;
        if (!key || !value) {
          out.opaque.push(sourceText(code, property));
          continue;
        }
        const kind: StyleProvenanceKind = !conditional && isLiteralValue(value) ? "literal" : "expression";
        out.props[cssPropertyForStyleKey(key)] = [kind, sourceText(code, value), key];
      }
      return;
    default:
      out.opaque.push(sourceText(code, node));
  }
}

/** Reads a JSX `style` attribute; null when it carries no inline style information. */
export function styleProvenance(
  attrs: readonly Node[],
  code: string,
  compiled: ReadonlySet<string>,
): StyleProvenance | null {
  const attr = attrs.find((candidate) =>
    candidate.type === "JSXAttribute"
    && (candidate.name as { type?: string; name?: string } | undefined)?.type === "JSXIdentifier"
    && (candidate.name as { name?: string }).name === "style");
  const container = attr?.value as Node | null | undefined;
  if (container?.type !== "JSXExpressionContainer") return null;
  const expression = container.expression as Node | undefined;
  if (!expression || expression.type === "JSXEmptyExpression") return null;
  const out: StyleProvenance = { props: {}, opaque: [] };
  collect(expression, false, out, code, compiled);
  out.opaque = out.opaque.filter(Boolean);
  return Object.keys(out.props).length > 0 || out.opaque.length > 0 ? out : null;
}
