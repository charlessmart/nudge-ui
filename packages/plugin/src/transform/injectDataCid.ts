import { parse } from "@babel/parser";
import MagicString, { type SourceMap } from "magic-string";

export interface InjectResult {
  code: string;
  map: SourceMap | null;
}

type Node = {
  type: string;
  [key: string]: unknown;
};

const PARSEABLE_EXT = /\.(tsx|jsx)$/;

const DECLARATION_SCOPE_TYPES = new Set([
  "FunctionDeclaration",
  "ClassDeclaration",
]);

const EXPRESSION_SCOPE_TYPES = new Set([
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassExpression",
]);

const ALL_SCOPE_TYPES = new Set([
  ...DECLARATION_SCOPE_TYPES,
  ...EXPRESSION_SCOPE_TYPES,
]);

const IDENTITY_ATTRS = new Set(["data-cid", "data-src", "data-cprops"]);

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function getScopeName(node: Node): string {
  const id = node.id as { name?: string } | null | undefined;
  return id?.name ?? "";
}

function hasAttr(attrs: Node[], attrName: string): boolean {
  return attrs.some(
    (a) =>
      a.type === "JSXAttribute" &&
      (a.name as { type?: string; name?: string } | undefined)?.type ===
        "JSXIdentifier" &&
      (a.name as { name?: string }).name === attrName,
  );
}

function getMemberExpressionName(node: Node): string | null {
  if (node.type === "JSXIdentifier") {
    return (node as unknown as { name?: string }).name ?? null;
  }
  if (node.type === "JSXMemberExpression") {
    const objName = getMemberExpressionName(node.object as Node);
    const propName =
      (node.property as { name?: string } | undefined)?.name ?? null;
    return objName && propName ? `${objName}.${propName}` : null;
  }
  return null;
}

function resolveCid(openingName: Node, scopeStack: string[]): string {
  const elementName = getMemberExpressionName(openingName);
  if (elementName && isComponentName(elementName)) return elementName;
  for (let i = scopeStack.length - 1; i >= 0; i--) {
    const scope = scopeStack[i];
    if (scope && isComponentName(scope)) return scope;
  }
  return "Anonymous";
}

function isNode(value: unknown): value is Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

const SKIP_KEYS = new Set([
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

function relativePath(id: string, root?: string): string {
  if (root) {
    const rootPrefix = root.endsWith("/") ? root : root + "/";
    if (id.startsWith(rootPrefix)) return id.slice(rootPrefix.length);
  }
  return id.replace(/^\//, "");
}

function serialiseAttribute(attr: Node): string | null {
  if (attr.type !== "JSXAttribute") return null;
  const nameNode = attr.name as { type?: string; name?: string } | undefined;
  if (nameNode?.type !== "JSXIdentifier") return null;
  const key = nameNode.name ?? "";
  if (!key || IDENTITY_ATTRS.has(key)) return null;
  const value = attr.value as Node | null | undefined;
  if (value === null || value === undefined) {
    return `${key}:true`;
  }
  if (value.type === "StringLiteral") {
    return `${key}:${String(value.value)}`;
  }
  if (value.type === "NumericLiteral") {
    return `${key}:${String(value.value)}`;
  }
  if (value.type === "BooleanLiteral") {
    return `${key}:${value.value ? "true" : "false"}`;
  }
  if (value.type === "JSXExpressionContainer") {
    const expr = value.expression as Node | null | undefined;
    if (!expr) return null;
    if (expr.type === "StringLiteral") {
      return `${key}:${String(expr.value)}`;
    }
    if (expr.type === "NumericLiteral") {
      return `${key}:${String(expr.value)}`;
    }
    if (expr.type === "BooleanLiteral") {
      return `${key}:${expr.value ? "true" : "false"}`;
    }
    // Inline function expressions are rendered as `fn(key)` per PLAN.md.
    // Bare identifiers are omitted (they may reference any type — PLAN.md's
    // canonical example omits `onClick={handleClick}`).
    if (
      expr.type === "ArrowFunctionExpression" ||
      expr.type === "FunctionExpression"
    ) {
      return `${key}:fn(${key})`;
    }
    return null;
  }
  return null;
}

function buildCprops(attrs: Node[]): string | null {
  const parts: string[] = [];
  for (const a of attrs) {
    const part = serialiseAttribute(a);
    if (part) parts.push(part);
  }
  if (parts.length === 0) return null;
  return parts.join(",");
}

function walkChildren(
  node: Node,
  scopeStack: string[],
  ms: MagicString,
  relPath: string,
): boolean {
  let changed = false;
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) {
          changed = walk(child, scopeStack, ms, relPath) || changed;
        }
      }
    } else if (isNode(value)) {
      changed = walk(value, scopeStack, ms, relPath) || changed;
    }
  }
  return changed;
}

function walk(
  node: Node,
  scopeStack: string[],
  ms: MagicString,
  relPath: string,
): boolean {
  // A function/class expression bound to a variable inherits the variable's
  // name as its component name (arrows have no own id).
  if (node.type === "VariableDeclarator") {
    const init = (node.init as Node | null | undefined) ?? null;
    const varName =
      (node.id as { name?: string } | null | undefined)?.name ?? null;
    if (init && varName && EXPRESSION_SCOPE_TYPES.has(init.type)) {
      scopeStack.push(varName);
      const changed = walkChildren(init, scopeStack, ms, relPath);
      scopeStack.pop();
      return changed;
    }
  }

  if (DECLARATION_SCOPE_TYPES.has(node.type)) {
    scopeStack.push(getScopeName(node));
    const changed = walkChildren(node, scopeStack, ms, relPath);
    scopeStack.pop();
    return changed;
  }

  if (ALL_SCOPE_TYPES.has(node.type)) {
    // Named/anonymous expression scopes: push their own id (may be null).
    scopeStack.push(getScopeName(node));
    const changed = walkChildren(node, scopeStack, ms, relPath);
    scopeStack.pop();
    return changed;
  }

  let changed = false;
  if (node.type === "JSXOpeningElement") {
    const attrs = (node.attributes as Node[]) ?? [];
    const nameNode = node.name as Node;
    const end = (nameNode.end as number | undefined) ?? null;
    if (typeof end === "number") {
      if (!hasAttr(attrs, "data-cid")) {
        const cid = resolveCid(nameNode, scopeStack);
        ms.appendRight(end, ` data-cid="${cid}"`);
        changed = true;
      }
      if (!hasAttr(attrs, "data-src")) {
        const loc = nameNode.loc as
          | { start?: { line?: number; column?: number } }
          | undefined;
        const line = loc?.start?.line;
        const col = loc?.start?.column;
        // Babel columns are 0-indexed; emit 1-indexed to match __source.
        if (typeof line === "number" && typeof col === "number") {
          ms.appendRight(end, ` data-src="${relPath}:${line}:${col + 1}"`);
          changed = true;
        }
      }
      if (!hasAttr(attrs, "data-cprops")) {
        const cprops = buildCprops(attrs);
        if (cprops) {
          ms.appendRight(end, ` data-cprops="${cprops}"`);
          changed = true;
        }
      }
    }
  }

  return walkChildren(node, scopeStack, ms, relPath) || changed;
}

export function injectIdentity(
  code: string,
  id: string,
  root?: string,
): InjectResult | null {
  if (id.includes("/node_modules/")) return null;
  if (!PARSEABLE_EXT.test(id)) return null;

  let ast: Node;
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    }) as unknown as Node;
  } catch {
    return null;
  }

  const ms = new MagicString(code);
  const relPath = relativePath(id, root);
  const changed = walk(ast, [], ms, relPath);
  if (!changed) return null;

  return {
    code: ms.toString(),
    map: ms.generateMap({ source: id, hires: true }),
  };
}

export function injectDataCid(
  code: string,
  id: string,
  root?: string,
): InjectResult | null {
  return injectIdentity(code, id, root);
}