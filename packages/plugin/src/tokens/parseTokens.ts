import postcss, {
  type Node as PostcssNode,
  type Declaration,
  type Rule,
  type AtRule,
} from "postcss";
import type { TokenEntry } from "../virtual/design-tokens.ts";

const GLOBAL_TOKEN_AT_RULES = new Set(["theme", "layer", "scope"]);

function isRootSelectorPart(sel: string): boolean {
  return sel === ":root" || /^:root[:.[]/.test(sel);
}

function isRootOnlySelector(rule: Rule): boolean {
  const parts = rule.selector.split(",").map((s) => s.trim());
  return parts.length > 0 && parts.every(isRootSelectorPart);
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
      return isRootOnlySelector(cur as Rule);
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
  let root;
  try {
    root = postcss.parse(css, { from: sourceId });
  } catch {
    return [];
  }

  const entries: TokenEntry[] = [];
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

    entries.push({
      name: decl.prop,
      value,
      source: `${sourceId}:${line}`,
    });
  });
  return entries;
}