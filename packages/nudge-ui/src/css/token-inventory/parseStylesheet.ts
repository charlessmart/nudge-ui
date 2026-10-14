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

export interface ParsedContribution {
  readonly definitions: readonly TokenDefinition[];
  readonly diagnostics: readonly InventoryDiagnostic[];
}

/** Deterministic per declaration: identical facts always produce the same id. */
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

/** A large rule made entirely of custom properties is a theme table; see the policy in `policy.ts`. */
function isScopedThemeTable(rule: Rule): boolean {
  const declarations = rule.nodes?.filter((node): node is Declaration => node.type === "decl") ?? [];
  return declarations.length >= MIN_THEME_TABLE_DECLARATIONS
    && declarations.every((declaration) => declaration.prop.startsWith("--"));
}

function isRule(node: PostcssNode): node is Rule {
  return node.type === "rule";
}

function isAtRule(node: PostcssNode): node is AtRule {
  return node.type === "atrule";
}


function nearestGlobalAncestor(decl: Declaration): boolean {
  // Global only when a :root rule or global at-rule is reached before any other rule.
  let cur: PostcssNode | undefined = decl.parent;
  while (cur) {
    if (isRule(cur)) {
      return isRootOnlySelector(cur) || isScopedThemeTable(cur);
    }
    if (isAtRule(cur)) {
      if (GLOBAL_TOKEN_AT_RULES.has(cur.name)) return true;
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
    if (isRule(current) && context.selector === undefined) {
      context.selector = current.selector;
    } else if (isAtRule(current)) {
      if (current.name === "media" || current.name === "supports" || current.name === "scope" || current.name === "layer") {
        // Parents are visited inner-to-outer, so prepend to keep source nesting order.
        wrappers.unshift({ kind: current.name, params: current.params });
      }
    }
    current = current.parent;
  }
  if (wrappers.length > 0) context.wrappers = wrappers;
  return context;
}

/** `order` is assigned by the inventory because it is positional across artifacts, not per-artifact. */
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
