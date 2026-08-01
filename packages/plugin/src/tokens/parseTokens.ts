import postcss, {
  type Node as PostcssNode,
  type Declaration,
  type Rule,
  type AtRule,
} from "postcss";
import type {
  TokenContext,
  TokenContextWrapper,
  TokenDeclaration,
  TokenDefinition,
  TokenEntry,
} from "../virtual/design-tokens.ts";

const GLOBAL_TOKEN_AT_RULES = new Set(["theme", "layer", "scope"]);
const MIN_THEME_TABLE_DECLARATIONS = 8;

function isRootSelectorPart(sel: string): boolean {
  return sel === ":root"
    || sel === ":host"
    || /^:root[:.[]/.test(sel)
    || /^:host[:.[]/.test(sel);
}

function isRootOnlySelector(rule: Rule): boolean {
  const parts = rule.selector.split(",").map((s) => s.trim());
  return parts.length > 0 && parts.every(isRootSelectorPart);
}

/**
 * Published design systems often scope an entire theme beneath a class on the
 * application shell instead of :root (for example, to support multiple themes
 * on one page). A sufficiently large rule made entirely of custom properties
 * is a theme table, not a component-local variable declaration. Its selector
 * is retained in the catalog and resolved against the selected element later.
 */
function isScopedThemeTable(rule: Rule): boolean {
  const declarations = rule.nodes?.filter((node): node is Declaration => node.type === "decl") ?? [];
  return declarations.length >= MIN_THEME_TABLE_DECLARATIONS
    && declarations.every((declaration) => declaration.prop.startsWith("--"));
}

function nearestRule(
  node: PostcssNode | undefined,
): Rule | undefined {
  let cur: PostcssNode | undefined = node;
  while (cur) {
    if (cur.type === "rule") return cur as Rule;
    cur = cur.parent;
  }
  return undefined;
}

function nearestGlobalAncestor(decl: Declaration): boolean {
  // Walk up; return true ONLY if we encounter a :root rule or a global at-rule
  // BEFORE encountering any non-:root rule. A non-:root rule (e.g. .button)
  // inside @layer still means the declaration is local, not a global token.
  let cur: PostcssNode | undefined = decl.parent;
  while (cur) {
    if (cur.type === "rule") {
      const rule = cur as Rule;
      return isRootOnlySelector(rule) || isScopedThemeTable(rule);
    }
    if (cur.type === "atrule") {
      const atRule = cur as AtRule;
      if (GLOBAL_TOKEN_AT_RULES.has(atRule.name)) return true;
    }
    cur = cur.parent;
  }
  return false;
}

function belongsToGlobalTokenContext(decl: Declaration): boolean {
  return nearestGlobalAncestor(decl);
}

export function parseTokens(css: string, sourceId: string): TokenEntry[] {
  return parseTokenCatalog(css, sourceId).map((token) => ({
    name: token.cssName,
    value: token.declarations[0]?.value ?? "",
    source: token.declarations[0]?.source ?? sourceId,
  }));
}

function declarationContext(decl: Declaration): TokenContext {
  const context: TokenContext = {};
  const wrappers: TokenContextWrapper[] = [];
  let current: PostcssNode | undefined = decl.parent;
  while (current) {
    if (current.type === "rule" && context.selector === undefined) {
      context.selector = (current as Rule).selector;
    } else if (current.type === "atrule") {
      const at = current as AtRule;
      if (at.name === "media" || at.name === "supports" || at.name === "scope" || at.name === "layer") {
        // Parents are visited inner-to-outer; prepend to preserve the source
        // nesting order and retain repeated/interleaved wrapper kinds.
        wrappers.unshift({ kind: at.name, params: at.params });
      }
    }
    current = current.parent;
  }
  if (wrappers.length > 0) context.wrappers = wrappers;
  return context;
}

export function parseTokenCatalog(css: string, sourceId: string): TokenDefinition[] {
  let root;
  try {
    root = postcss.parse(css, { from: sourceId });
  } catch {
    return [];
  }

  const definitions = new Map<string, TokenDefinition>();
  root.walkDecls((decl) => {
    if (!decl.prop.startsWith("--")) return;
    if (!belongsToGlobalTokenContext(decl)) return;

    let value = decl.value;
    if (decl.important) {
      value = value.replace(/!\s*important\s*$/i, "").trim();
    }
    value = value.trim();

    const line = decl.source?.start?.line;
    if (typeof line !== "number") return;

    const declaration: TokenDeclaration = {
      value,
      source: `${sourceId}:${line}`,
      important: Boolean(decl.important),
      context: declarationContext(decl),
    };
    const existing = definitions.get(decl.prop);
    if (existing) existing.declarations.push(declaration);
    else definitions.set(decl.prop, { cssName: decl.prop, name: decl.prop, declarations: [declaration] });
  });
  return [...definitions.values()];
}
