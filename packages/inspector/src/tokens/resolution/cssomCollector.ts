import { computeSpecificity } from "./selectorSemantics.ts";
import type { AtRuleContext, MatchedRule, StyleDeclaration } from "./types.ts";

interface RuleSnapshot {
  revision: number;
  rules: MatchedRule[];
  inaccessible: boolean;
}

interface DocumentRevisions {
  element: number;
  stylesheet: number;
}

const documentRevisions = new WeakMap<Document, DocumentRevisions>();
const ruleSnapshots = new WeakMap<Document, RuleSnapshot>();

function isStylesheetNode(node: Node | null): boolean {
  if (!node || node.nodeType !== node.ELEMENT_NODE) return false;
  const tag = (node as Element).tagName.toLowerCase();
  return tag === "style" || tag === "link";
}

function changesStylesheet(record: MutationRecord): boolean {
  if (record.type === "attributes") return isStylesheetNode(record.target);
  if (record.type === "characterData") return isStylesheetNode(record.target.parentElement);
  return isStylesheetNode(record.target)
    || Array.from(record.addedNodes).some(isStylesheetNode)
    || Array.from(record.removedNodes).some(isStylesheetNode);
}

export function documentRevision(doc: Document): number {
  let record = documentRevisions.get(doc);
  if (!record) {
    record = { element: 0, stylesheet: 0 };
    documentRevisions.set(doc, record);

    const Observer = doc.defaultView?.MutationObserver;
    const root = doc.documentElement;
    if (Observer && root) {
      const observer = new Observer((records) => {
        record!.element++;
        if (records.some(changesStylesheet)) record!.stylesheet++;
      });
      observer.observe(root, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
      });

      doc.defaultView?.addEventListener("resize", () => {
        record!.element++;
        record!.stylesheet++;
      });
    }
  }
  return record.element;
}

function stylesheetRevision(doc: Document): number {
  documentRevision(doc);
  return documentRevisions.get(doc)!.stylesheet;
}

/** Invalidates CSSOM-derived snapshots after programmatic stylesheet edits. */
export function invalidateStyleResolutionCache(doc: Document = document): void {
  const record = documentRevisions.get(doc);
  if (record) {
    record.element++;
    record.stylesheet++;
  }
  ruleSnapshots.delete(doc);
}

function isStyleRuleInDocument(rule: CSSRule, doc: Document): rule is CSSStyleRule {
  const StyleRule = doc.defaultView?.CSSStyleRule;
  if (StyleRule && rule instanceof StyleRule) return true;
  return rule.type === (doc.defaultView?.CSSRule.STYLE_RULE ?? 1)
    && "selectorText" in rule && "style" in rule;
}

/**
 * Reads the declarations the browser accepted for a style rule. This is the
 * semantic source for authored values; it intentionally does not inspect the
 * stylesheet element's original text. CSSOM may expose a shorthand as empty
 * longhand entries through indexed enumeration, so prefer its serialized
 * declaration block and use enumeration as a compatibility fallback.
 */
export function declarationsFromCssom(style: CSSStyleDeclaration): StyleDeclaration[] {
  const declarations = parseCssomDeclarations(style.cssText);
  const seen = new Set(declarations.map((declaration) => declaration.property));
  for (let index = 0; index < style.length; index++) {
    const property = typeof style.item === "function" ? style.item(index) : style[index] ?? "";
    if (!property || seen.has(property)) continue;
    const value = style.getPropertyValue(property);
    if (!value) continue;
    declarations.push({
      property,
      value,
      important: style.getPropertyPriority(property) === "important",
    });
  }
  return declarations;
}

function parseCssomDeclarations(cssText: string): StyleDeclaration[] {
  const declarations: StyleDeclaration[] = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let quote: string | null = null;
  let escaped = false;

  const append = (part: string): void => {
    const colon = findTopLevelColon(part);
    if (colon < 0) return;
    const property = part.slice(0, colon).trim();
    let value = part.slice(colon + 1).trim();
    if (!property || !value) return;
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, "").trim();
    declarations.push({ property, value, important });
  };

  for (let index = 0; index < cssText.length; index++) {
    const char = cssText[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "[") bracketDepth++;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === "{") braceDepth++;
    else if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (char === ";" && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      append(cssText.slice(start, index));
      start = index + 1;
    }
  }
  append(cssText.slice(start));
  return declarations;
}

function findTopLevelColon(value: string): number {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = 0; index < value.length; index++) {
    const char = value[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "[") bracketDepth++;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === "{") braceDepth++;
    else if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (char === ":" && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) return index;
  }
  return -1;
}

function atRuleParams(cssText: string, name: "media" | "container" | "supports"): string {
  const match = new RegExp(`^\\s*@${name}\\s+([\\s\\S]*?)\\s*\\{`, "i").exec(cssText);
  return match?.[1]?.trim() ?? "";
}

function contextForRule(
  cssText: string,
  record: { conditionText?: string; containerName?: string },
): AtRuleContext | null {
  if (/^\s*@media\b/i.test(cssText)) {
    const params = record.conditionText?.trim() || atRuleParams(cssText, "media");
    return params ? { kind: "media", params } : null;
  }
  if (/^\s*@container\b/i.test(cssText)) {
    // CSSContainerRule exposes `conditionText` and `containerName` in modern
    // engines. Fall back to the serialised prelude so named, style, and newer
    // container queries remain presentable without hand-parsing their grammar.
    const containerName = record.containerName?.trim();
    const fromInterfaces = [containerName && containerName !== "none" ? containerName : undefined, record.conditionText?.trim()]
      .filter((part): part is string => Boolean(part))
      .join(" ");
    const params = fromInterfaces || atRuleParams(cssText, "container");
    return params ? { kind: "container", params } : null;
  }
  if (/^\s*@supports\b/i.test(cssText)) {
    const params = record.conditionText?.trim() || atRuleParams(cssText, "supports");
    return params ? { kind: "supports", params } : null;
  }
  return null;
}

function isNestedDeclarations(rule: CSSRule, doc: Document): rule is CSSRule & { style: CSSStyleDeclaration } {
  if (isStyleRuleInDocument(rule, doc) || !("style" in rule) || "selectorText" in rule) return false;
  // Chromium represents declarations nested in a style rule's @supports /
  // @media block as CSSNestedDeclarations. Its public type is not yet in
  // lib.dom, so identify its declaration-only CSSOM shape conservatively.
  return !/^\s*@/.test(rule.cssText ?? "") && typeof (rule as { style?: unknown }).style === "object";
}

export function collectRules(doc: Document): { rules: MatchedRule[]; inaccessible: boolean } {
  const revision = stylesheetRevision(doc);
  const cached = ruleSnapshots.get(doc);
  if (cached?.revision === revision) {
    return { rules: cached.rules, inaccessible: cached.inaccessible };
  }

  const out: MatchedRule[] = [];
  let inaccessible = false;
  let sourceOrder = 0;
  const walkRules = (
    rules: CSSRuleList,
    active = true,
    layer?: string,
    atRules: AtRuleContext[] = [],
    inheritedSelector?: string,
    source?: string,
  ): void => {
    for (const rule of Array.from(rules)) {
      if (isStyleRuleInDocument(rule, doc)) {
        try {
          out.push({
            selectorText: rule.selectorText,
            specificity: computeSpecificity(rule.selectorText),
            declarations: declarationsFromCssom(rule.style),
            source,
            sourceOrder: sourceOrder++,
            active,
            layer,
            atRules: atRules.length > 0 ? atRules : undefined,
          });
          const nested = (rule as unknown as { cssRules?: CSSRuleList }).cssRules;
          if (nested?.length) walkRules(nested, active, layer, atRules, rule.selectorText, source);
        } catch {
          continue;
        }
      } else if (isNestedDeclarations(rule, doc)) {
        if (!inheritedSelector) continue;
        try {
          out.push({
            selectorText: inheritedSelector,
            specificity: computeSpecificity(inheritedSelector),
            declarations: declarationsFromCssom(rule.style),
            source,
            sourceOrder: sourceOrder++,
            active,
            layer,
            atRules: atRules.length > 0 ? atRules : undefined,
          });
        } catch {
          continue;
        }
      } else if ("cssRules" in rule) {
        try {
          const record = rule as unknown as {
            cssRules: CSSRuleList;
            conditionText?: string;
            containerName?: string;
            name?: string;
          };
          let childActive = active;
          const cssText = rule.cssText ?? "";
          const isMedia = /^\s*@media\b/i.test(cssText);
          const isSupports = /^\s*@supports\b/i.test(cssText);
          const isLayer = /^\s*@layer\b/i.test(cssText);
          const view = doc.defaultView;
          if (isMedia && record.conditionText) childActive = active && (view ? view.matchMedia(record.conditionText).matches : false);
          else if (isSupports && record.conditionText) childActive = active && (doc.defaultView?.CSS?.supports(record.conditionText) ?? false);
          // A container query is evaluated relative to the styled element, so
          // it cannot be answered while walking a document-level stylesheet.
          // Resolution evaluates its retained context against the selected
          // element using a harmless browser probe.
          const context = contextForRule(cssText, record);
          const childLayer = isLayer ? record.name ?? cssText.slice(6, cssText.indexOf("{")).trim() : layer;
          walkRules(
            record.cssRules,
            childActive,
            childLayer,
            context ? [...atRules, context] : atRules,
            inheritedSelector,
            source,
          );
        } catch {
          continue;
        }
      }
    }
  };

  const stylesheetNodes = Array.from(doc.querySelectorAll<HTMLElement>('style, link[rel~="stylesheet"]'));
  for (const [index, sheet] of Array.from(doc.styleSheets).entries()) {
    try {
      // jsdom does not currently expose CSSStyleSheet.ownerNode; the document
      // stylesheet list and stylesheet element list retain the same order.
      const owner = (sheet.ownerNode as HTMLElement | null) ?? stylesheetNodes[index] ?? null;
      const source = owner?.dataset?.viteDevId
        ?? sheet.href
        ?? (owner?.id ? `#${owner.id}` : `stylesheet:${index + 1}`);
      walkRules(sheet.cssRules, true, undefined, [], undefined, source);
    } catch {
      inaccessible = true;
    }
  }
  const snapshot = { revision, rules: out, inaccessible };
  ruleSnapshots.set(doc, snapshot);
  return snapshot;
}
