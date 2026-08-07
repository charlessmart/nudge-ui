/**
 * Internal ordinary-CSS parsing for the token inventory.
 *
 * This is the canonical home of the parsing previously owned by the plugin.
 * Behavior is preserved for root/host themes, contextual selectors, wrapper
 * capture, duplicate declarations, importance, and source locations; the two
 * differences are:
 *
 * 1. Declarations carry a deterministic `id` and a `source`-anchored local
 *    order so the inventory can aggregate without Vite.
 * 2. Malformed CSS no longer silently yields an empty list — it produces a
 *    structured `stylesheet-parse-failed` diagnostic plus an empty
 *    contribution for that artifact.
 *
 * This module runs at build time only (Node) and is not reachable from the
 * browser-safe subpaths.
 */
import postcss, {
  type Node as PostcssNode,
  type Declaration,
  type Rule,
  type AtRule,
} from "postcss";
import type {
  TokenContext,
  TokenContextWrapper,
  TokenDefinition,
  TokenDeclaration,
} from "../model/index.ts";
import { GLOBAL_TOKEN_AT_RULES, MIN_THEME_TABLE_DECLARATIONS } from "./policy.ts";
import type { InventoryDiagnostic, StylesheetArtifact } from "./types.ts";

/** The parsed contribution of one stylesheet artifact. */
export interface ParsedContribution {
  readonly definitions: readonly TokenDefinition[];
  readonly diagnostics: readonly InventoryDiagnostic[];
}

/**
 * Deterministic declaration identity, keyed by (artifact id, cssName, source
 * line, context, local order). The id does not depend on event-batch timing:
 * the same facts always produce the same ids.
 */
function declarationId(
  artifact: StylesheetArtifact,
  cssName: string,
  source: string,
  context: TokenContext,
  localOrder: number,
): string {
  return `${artifact.buildTool}\u0000${artifact.id}\u0000${artifact.stage}`
    + `\u0000${cssName}\u0000${source}\u0000${JSON.stringify(context)}\u0000${localOrder}`;
}

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
 * Scoped theme-table policy — see `policy.ts` for the named constant and
 * rationale. A sufficiently large rule made entirely of custom properties is a
 * theme table, not a component-local variable declaration; its selector is
 * retained in the catalog and resolved against the selected element later.
 */
function isScopedThemeTable(rule: Rule): boolean {
  const declarations = rule.nodes?.filter((node): node is Declaration => node.type === "decl") ?? [];
  return declarations.length >= MIN_THEME_TABLE_DECLARATIONS
    && declarations.every((declaration) => declaration.prop.startsWith("--"));
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

/**
 * Parse one stylesheet artifact into grouped definitions plus diagnostics.
 *
 * The returned declarations carry `id` (stable per declaration) and the
 * definition list preserves source order. `order` is assigned by the
 * inventory during snapshot assembly because it is a positional fact across
 * artifacts, not a per-artifact one.
 */
export function parseStylesheetArtifact(artifact: StylesheetArtifact): ParsedContribution {
  const content = artifact.content ?? "";
  let root;
  try {
    root = postcss.parse(content, { from: artifact.id });
  } catch (error) {
    return {
      definitions: [],
      diagnostics: [{
        code: "stylesheet-parse-failed",
        artifact: artifact.id,
        message: `Stylesheet artifact "${artifact.id}" could not be parsed as CSS: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }],
    };
  }

  const definitions = new Map<string, TokenDefinition>();
  let localOrder = 0;
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

    const source = `${artifact.id}:${line}`;
    const context = declarationContext(decl);
    const declaration: TokenDeclaration = {
      id: declarationId(artifact, decl.prop, source, context, localOrder),
      order: localOrder,
      value,
      source,
      important: Boolean(decl.important),
      context,
    };
    const existing = definitions.get(decl.prop);
    if (existing) existing.declarations.push(declaration);
    else definitions.set(decl.prop, { cssName: decl.prop, name: decl.prop, declarations: [declaration] });
    localOrder += 1;
  });
  return { definitions: [...definitions.values()], diagnostics: [] };
}
