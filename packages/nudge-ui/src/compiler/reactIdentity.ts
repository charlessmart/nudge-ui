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
import type { ComponentInvocationMeta } from "./componentContractTypes.ts";
import { IDENTITY_ATTRIBUTES } from "./identityAttributes.ts";

export type { ComponentInstrumentationOptions } from "./componentInstrumentation.ts";

export interface InjectResult {
  code: string;
  map: SourceMap | null;
  /** The exact single line prepended to bind the runtime, or null; hosts with a directive prologue relocate it. */
  prelude: string | null;
}

export interface InjectIdentityOptions extends ComponentInstrumentationOptions {
  instrumentComponents?: boolean;
  componentRuntimeModule?: string;
}

export const DEFAULT_COMPONENT_RUNTIME_MODULE = "nudge-ui/internal/component-runtime";

const PARSEABLE_EXT = /\.(tsx|jsx)$/;

const EXPRESSION_SCOPE_TYPES = new Set([
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassExpression",
]);

const ALL_SCOPE_TYPES = new Set([
  "FunctionDeclaration",
  "ClassDeclaration",
  ...EXPRESSION_SCOPE_TYPES,
]);

const IDENTITY_ATTRS = new Set<string>(IDENTITY_ATTRIBUTES);

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
    // Inline functions render as `fn(key)`; bare identifiers and other expressions are omitted.
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

/** Dev-runtime metadata only; nothing here reaches production output. */
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
  /** Callsites left unwrapped, registered so the runtime can still name them. */
  registeredCallsites: ComponentInvocationMeta[];
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
          // A component may inspect children or slot props before rendering them; only promised slots are traversed.
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
  // A function/class expression inherits the variable's name as its component name (arrows have no own id).
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
    scopeStack.push(getScopeName(node));
    walkChildren(node, scopeStack, ms, relPath, options, state, allowComponentWrapping);
    scopeStack.pop();
    return;
  }

  if (node.type === "JSXElement" && options.instrumentComponents) {
    const opening = node.openingElement as Node | undefined;
    const openingName = opening?.name as Node | undefined;
    const componentName = elementName(openingName);
    const start = node.start as number | undefined;
    const end = node.end as number | undefined;
    const loc = openingName?.loc as { start?: { line?: number; column?: number } } | undefined;
    const line = loc?.start?.line;
    const column = loc?.start?.column;
    const attrs = (opening?.attributes as Node[] | undefined) ?? [];
    if (
      componentName
      && (isComponentName(componentName) || componentName.includes("."))
      && typeof line === "number"
      && typeof column === "number"
    ) {
      const meta: ComponentInvocationMeta = {
        callsiteId: `${relPath}:${line}:${column + 1}`,
        componentId: state.componentPolicy.componentId(componentName)
          ?? componentIdFor(componentName, relPath, state.componentPolicy.bindings),
        componentName,
        file: relPath,
        line,
        column: column + 1,
        authoredProps: authoredPropKinds(attrs, (node.children as Node[] | undefined) ?? []),
      };
      if (
        allowComponentWrapping
        && state.componentPolicy.canWrap(componentName)
        && typeof start === "number"
        && typeof end === "number"
      ) {
        const needsExpression = parent?.type === "JSXElement" || parent?.type === "JSXFragment";
        // appendRight preserves insertion order at a shared `</First><Second>` boundary.
        ms.appendRight(
          start,
          `${needsExpression ? "{" : ""}__nudgeUiInstrumentComponent(`,
        );
        ms.appendRight(end, `, ${JSON.stringify(meta)})${needsExpression ? "}" : ""}`);
        state.changed = true;
        state.instrumentedComponents = true;
      } else if (!hasAttr(attrs, "data-src")) {
        // Not safe to wrap; the injected `data-src` still reaches the component's props, which is all the runtime needs to name it.
        state.registeredCallsites.push(meta);
        state.changed = true;
      }
    }
  }

  if (node.type === "JSXOpeningElement") {
    const attrs = (node.attributes as Node[]) ?? [];
    const nameNode = node.name as Node;
    // JSX type arguments (`<Button<Props> size="small" />`) must stay adjacent to the name, so attributes go after the complete type argument list.
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
    registeredCallsites: [],
  };
  walk(ast, null, [], ms, relPath, options, state, true);
  if (!state.changed) return null;
  const prelude = componentRuntimePrelude(
    options.componentRuntimeModule ?? DEFAULT_COMPONENT_RUNTIME_MODULE,
    state,
  );
  if (prelude) ms.prepend(prelude);

  return {
    code: ms.toString(),
    map: ms.generateMap({ source: id, hires: true }),
    prelude,
  };
}

function componentRuntimePrelude(runtimeModule: string, state: WalkState): string | null {
  const bindings = [
    ...(state.instrumentedComponents ? ["instrumentReactComponent as __nudgeUiInstrumentComponent"] : []),
    ...(state.registeredCallsites.length > 0 ? ["registerReactCallsites as __nudgeUiRegisterCallsites"] : []),
  ];
  if (bindings.length === 0) return null;
  const registration = state.registeredCallsites.length > 0
    ? ` __nudgeUiRegisterCallsites(${JSON.stringify(state.registeredCallsites)});`
    : "";
  return `import { ${bindings.join(", ")} } from ${JSON.stringify(runtimeModule)};${registration}\n`;
}
