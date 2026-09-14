import MagicString, { type SourceMap } from "magic-string";
import { posix } from "node:path";
import {
  elementName,
  isNode,
  jsxMemberName,
  parseModule,
  SKIP_KEYS,
  type SyntaxNode as Node,
} from "./ast.ts";
import {
  createComponentInstrumentationPolicy,
  type ComponentInstrumentationOptions,
  type ComponentInstrumentationPolicy,
} from "./componentInstrumentation.ts";
import { relativePath, stripModuleExtension } from "./sourcePaths.ts";

export type { ComponentInstrumentationOptions } from "./componentInstrumentation.ts";

export interface InjectResult {
  code: string;
  map: SourceMap | null;
}

export interface InjectIdentityOptions extends ComponentInstrumentationOptions {
  instrumentComponents?: boolean;
  /** Module specifier emitted for the host-owned semantic runtime. */
  componentRuntimeModule?: string;
}

export const DEFAULT_COMPONENT_RUNTIME_MODULE = "nudge-ui/internal/component-runtime";

const PARSEABLE_EXT = /\.(tsx|jsx)$/;

const EXPRESSION_SCOPE_TYPES = new Set([
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassExpression",
]);

// Scopes that contribute an id to the scope stack: declarations push their
// own name; expressions are pushed at their VariableDeclarator binding, or
// here by their own id (may be null) when anonymous.
const ALL_SCOPE_TYPES = new Set([
  "FunctionDeclaration",
  "ClassDeclaration",
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

function resolveCid(openingName: Node, scopeStack: string[]): string {
  const name = jsxMemberName(openingName);
  if (name && isComponentName(name)) return name;
  for (let i = scopeStack.length - 1; i >= 0; i--) {
    const scope = scopeStack[i];
    if (scope && isComponentName(scope)) return scope;
  }
  return "Anonymous";
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

function escapeJsxAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function authoredPropKinds(attrs: Node[], children: Node[] = []) {
  const result: Record<string, "literal" | "expression" | "spread"> = {};
  for (const attr of attrs) {
    if (attr.type === "JSXSpreadAttribute") {
      result["..."] = "spread";
      continue;
    }
    if (attr.type !== "JSXAttribute") continue;
    const name = elementName(attr.name);
    if (!name || IDENTITY_ATTRS.has(name) || name === "key" || name === "ref") continue;
    const value = attr.value as Node | null | undefined;
    result[name] = value === null || value === undefined
      || value.type === "StringLiteral"
      || (value.type === "JSXExpressionContainer"
        && isNode(value.expression)
        && (value.expression.type === "StringLiteral"
          || value.expression.type === "NumericLiteral"
          || value.expression.type === "BooleanLiteral"))
      ? "literal"
      : "expression";
  }
  const childKind = authoredChildrenKind(children);
  if (childKind) result.children = childKind;
  return result;
}

/**
 * Preserve the authored shape of primitive JSX children in invocation
 * metadata. This is metadata for the dev runtime only; it does not add a
 * production attribute or wrapper to the application output.
 */
function authoredChildrenKind(children: Node[]): "literal" | "expression" | "spread" | null {
  if (children.length === 0) return null;
  let kind: "literal" | "expression" | "spread" | null = null;
  for (const child of children) {
    if (child.type === "JSXText") {
      if (String(child.value ?? "").trim() === "") continue;
      kind = kind === "spread" || kind === "expression" ? kind : "literal";
      continue;
    }
    if (child.type === "JSXSpreadChild") {
      kind = "spread";
      continue;
    }
    if (child.type !== "JSXExpressionContainer") continue;
    const expression = child.expression as Node | null | undefined;
    if (!expression || expression.type === "JSXEmptyExpression") continue;
    const literal = expression.type === "StringLiteral"
      || expression.type === "NumericLiteral"
      || expression.type === "BooleanLiteral";
    if (kind === "spread") continue;
    kind = literal && (kind === null || kind === "literal") ? "literal" : "expression";
  }
  return kind;
}

interface WalkState {
  changed: boolean;
  instrumentedComponents: boolean;
  componentPolicy: ComponentInstrumentationPolicy;
}

function componentIdFor(
  componentName: string,
  relPath: string,
  bindings: ComponentInstrumentationPolicy["bindings"],
): string {
  const [rootName, ...members] = componentName.split(".");
  const binding = rootName ? bindings.get(rootName) : undefined;
  if (!binding) return `${stripModuleExtension(relPath)}#${componentName}`;
  const moduleId = binding.source.startsWith(".")
    ? stripModuleExtension(posix.normalize(posix.join(posix.dirname(relPath), binding.source)))
    : stripModuleExtension(binding.source);
  const exportName = binding.namespace
    ? members.join(".") || rootName!
    : binding.exportName ?? rootName!;
  return `${moduleId}#${exportName}`;
}

function walkChildren(
  node: Node,
  scopeStack: string[],
  ms: MagicString,
  relPath: string,
  options: InjectIdentityOptions,
  state: WalkState,
  allowComponentWrapping: boolean,
): void {
  const opening = node.type === "JSXElement" ? node.openingElement as Node : node;
  const componentName = opening.type === "JSXOpeningElement" ? elementName(opening.name) : null;
  const customElement = componentName !== null && (isComponentName(componentName) || componentName.includes("."));
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) {
          // A component can inspect its children or slot props before React
          // renders them. Preserve those element values unless the receiving
          // interface explicitly promises to render them.
          const renderedChild = !customElement
            || (key === "children" && state.componentPolicy.rendersChildren(componentName!))
            || (key === "attributes" && state.componentPolicy.rendersProp(componentName!, elementName(child.name) ?? ""))
            || (key !== "children" && key !== "attributes");
          walk(child, node, scopeStack, ms, relPath, options, state, allowComponentWrapping && renderedChild);
        }
      }
    } else if (isNode(value)) {
      walk(value, node, scopeStack, ms, relPath, options, state, allowComponentWrapping);
    }
  }
}

function walk(
  node: Node,
  parent: Node | null,
  scopeStack: string[],
  ms: MagicString,
  relPath: string,
  options: InjectIdentityOptions,
  state: WalkState,
  allowComponentWrapping: boolean,
): void {
  // A function/class expression bound to a variable inherits the variable's
  // name as its component name (arrows have no own id).
  if (node.type === "VariableDeclarator") {
    const init = (node.init as Node | null | undefined) ?? null;
    const varName =
      (node.id as { name?: string } | null | undefined)?.name ?? null;
    if (init && varName && EXPRESSION_SCOPE_TYPES.has(init.type)) {
      scopeStack.push(varName);
      walkChildren(init, scopeStack, ms, relPath, options, state, allowComponentWrapping);
      scopeStack.pop();
      return;
    }
  }

  if (ALL_SCOPE_TYPES.has(node.type)) {
    // Named/anonymous function and class scopes: push their own id (may be null).
    scopeStack.push(getScopeName(node));
    walkChildren(node, scopeStack, ms, relPath, options, state, allowComponentWrapping);
    scopeStack.pop();
    return;
  }

  if (node.type === "JSXElement" && options.instrumentComponents && allowComponentWrapping) {
    const opening = node.openingElement as Node | undefined;
    const openingName = opening?.name as Node | undefined;
    const componentName = elementName(openingName);
    const start = node.start as number | undefined;
    const end = node.end as number | undefined;
    const loc = openingName?.loc as { start?: { line?: number; column?: number } } | undefined;
    const line = loc?.start?.line;
    const column = loc?.start?.column;
    if (
      componentName
      && (isComponentName(componentName) || componentName.includes("."))
      && state.componentPolicy.canWrap(componentName)
      && typeof start === "number"
      && typeof end === "number"
      && typeof line === "number"
      && typeof column === "number"
    ) {
      const attrs = (opening?.attributes as Node[] | undefined) ?? [];
      const meta = {
        callsiteId: `${relPath}:${line}:${column + 1}`,
        componentId: state.componentPolicy.componentId(componentName)
          ?? componentIdFor(componentName, relPath, state.componentPolicy.bindings),
        componentName,
        file: relPath,
        line,
        column: column + 1,
        authoredProps: authoredPropKinds(attrs, (node.children as Node[] | undefined) ?? []),
      };
      const needsExpression = parent?.type === "JSXElement" || parent?.type === "JSXFragment";
      // appendRight preserves insertion order when two JSX siblings have no
      // whitespace between them. At the shared `</First><Second>` boundary,
      // the first component's closing wrapper must be emitted before the
      // second component's opening wrapper.
      ms.appendRight(
        start,
        `${needsExpression ? "{" : ""}__nudgeUiInstrumentComponent(`,
      );
      ms.appendRight(end, `, ${JSON.stringify(meta)})${needsExpression ? "}" : ""}`);
      state.changed = true;
      state.instrumentedComponents = true;
    }
  }

  if (node.type === "JSXOpeningElement") {
    const attrs = (node.attributes as Node[]) ?? [];
    const nameNode = node.name as Node;
    // TypeScript JSX type arguments sit between the component name and its
    // attributes (`<Button<Props> size="small" />`). Injecting immediately
    // after the name would produce the invalid `<Button data-cid...<Props>`
    // shape, so place identity attributes after the complete type argument
    // list when one is present.
    const typeArguments =
      (node.typeArguments as Node | null | undefined) ??
      (node.typeParameters as Node | null | undefined);
    const end =
      (typeArguments?.end as number | undefined) ??
      (nameNode.end as number | undefined) ??
      null;
    if (typeof end === "number") {
      if (!hasAttr(attrs, "data-cid")) {
        const cid = resolveCid(nameNode, scopeStack);
        ms.appendRight(end, ` data-cid="${cid}"`);
        state.changed = true;
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
          state.changed = true;
        }
      }
      if (!hasAttr(attrs, "data-cprops")) {
        const cprops = buildCprops(attrs);
        if (cprops) {
          ms.appendRight(end, ` data-cprops="${escapeJsxAttribute(cprops)}"`);
          state.changed = true;
        }
      }
    }
  }

  walkChildren(node, scopeStack, ms, relPath, options, state, allowComponentWrapping);
}

export function injectIdentity(
  code: string,
  id: string,
  root?: string,
  options: InjectIdentityOptions = {},
): InjectResult | null {
  if (id.includes("/node_modules/")) return null;
  if (!PARSEABLE_EXT.test(id)) return null;

  const ast = parseModule(code);
  if (!ast) return null;

  const ms = new MagicString(code);
  const relPath = relativePath(id, root);
  const state: WalkState = {
    changed: false,
    instrumentedComponents: false,
    componentPolicy: createComponentInstrumentationPolicy(ast, options),
  };
  walk(ast, null, [], ms, relPath, options, state, true);
  if (!state.changed) return null;
  if (state.instrumentedComponents) {
    const runtimeModule = options.componentRuntimeModule ?? DEFAULT_COMPONENT_RUNTIME_MODULE;
    ms.prepend(
      `import { instrumentReactComponent as __nudgeUiInstrumentComponent } from ${JSON.stringify(runtimeModule)};\n`,
    );
  }

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
