import { computeSpecificity } from "./selectorSemantics.ts";
import type { MatchedRule, StyleDeclaration } from "./types.ts";

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
 * stylesheet element's original text.
 */
export function declarationsFromCssom(style: CSSStyleDeclaration): StyleDeclaration[] {
  const declarations: StyleDeclaration[] = [];
  for (let index = 0; index < style.length; index++) {
    const property = typeof style.item === "function" ? style.item(index) : style[index] ?? "";
    if (!property) continue;
    declarations.push({
      property,
      value: style.getPropertyValue(property),
      important: style.getPropertyPriority(property) === "important",
    });
  }
  return declarations;
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
  ): void => {
    for (const rule of Array.from(rules)) {
      if (isStyleRuleInDocument(rule, doc)) {
        try {
          out.push({
            selectorText: rule.selectorText,
            specificity: computeSpecificity(rule.selectorText),
            declarations: declarationsFromCssom(rule.style),
            sourceOrder: sourceOrder++,
            active,
            layer,
          });
        } catch {
          continue;
        }
      } else if ("cssRules" in rule) {
        try {
          const record = rule as unknown as { cssRules: CSSRuleList; conditionText?: string; name?: string };
          let childActive = active;
          const cssText = rule.cssText ?? "";
          if (cssText.startsWith("@media") && record.conditionText) childActive = active && doc.defaultView!.matchMedia(record.conditionText).matches;
          else if (cssText.startsWith("@supports") && record.conditionText) childActive = active && (doc.defaultView?.CSS?.supports(record.conditionText) ?? false);
          else if (cssText.startsWith("@container")) childActive = false;
          const childLayer = cssText.startsWith("@layer") ? record.name ?? cssText.slice(6, cssText.indexOf("{")).trim() : layer;
          walkRules(record.cssRules, childActive, childLayer);
        } catch {
          continue;
        }
      }
    }
  };

  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      walkRules(sheet.cssRules);
    } catch {
      inaccessible = true;
    }
  }
  const snapshot = { revision, rules: out, inaccessible };
  ruleSnapshots.set(doc, snapshot);
  return snapshot;
}
