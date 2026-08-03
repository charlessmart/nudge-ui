import { getElementComputedStyle } from "./domRealm.ts";
import { notifyBrowserStylesheetChange } from "./inspection/browserCssInspectionRegistry.ts";
import type { TokenContextWrapper } from "virtual:design-tokens";
import { escapeAttrValue, escapeCssString } from "./cssEscapes.ts";

export { escapeAttrValue, escapeCssString } from "./cssEscapes.ts";

export interface StyleRule {
  selector: string;
  declarations: Record<string, string>;
  context?: StyleRuleContext;
}

export interface StyleRuleContext {
  wrappers?: TokenContextWrapper[];
}

export type PreviewConflictReason = "higher-specificity" | "inline-style" | "important" | "animation" | "transition" | "target-missing" | "token-drift";

export interface PreviewResult {
  requestedValue: string;
  computedValue: string;
  status: "applied" | "conflict";
  reason?: PreviewConflictReason;
}

const SHEET_ID = "design-tool-styles";
type ManagedDebugWindow = Window & {
  __designToolGetManagedSheetText?: () => string;
};

let managedHeadGuardDocument: Document | null = null;
let managedHeadGuard: MutationObserver | null = null;

function installManagedHeadGuard(doc: Document): void {
  const Observer = doc.defaultView?.MutationObserver;
  if (!Observer || !doc.head || managedHeadGuardDocument === doc) return;
  managedHeadGuard?.disconnect();
  managedHeadGuardDocument = doc;
  managedHeadGuard = new Observer(() => {
    const managed = doc.getElementById(SHEET_ID);
    if (managed && doc.head.lastElementChild !== managed) doc.head.appendChild(managed);
  });
  managedHeadGuard.observe(doc.head, { childList: true });
}

export function ensureManagedSheet(): CSSStyleSheet {
  const doc = document;
  let el = doc.getElementById(SHEET_ID) as HTMLStyleElement | null;
  if (!el) {
    el = doc.createElement("style");
    el.id = SHEET_ID;
    el.setAttribute("data-design-tool", "managed");
    doc.head.appendChild(el);
  }
  let sheet = el.sheet;
  if (!sheet) {
    // A browser may reject a newly-authored conditional rule (or a test DOM may
    // not implement it). Recreate the managed element so later clear/revert
    // operations can always recover instead of leaving history wedged.
    el.remove();
    el = doc.createElement("style");
    el.id = SHEET_ID;
    el.setAttribute("data-design-tool", "managed");
    doc.head.appendChild(el);
    sheet = el.sheet;
  }
  if (!sheet) {
    throw new Error("design-tool managed stylesheet could not be initialised");
  }
  if (doc.head.lastElementChild !== el) doc.head.appendChild(el);
  installManagedHeadGuard(doc);
  if (import.meta.env.DEV && doc.defaultView) {
    // Keep authored CSS available to dev diagnostics without writing
    // textContent on the live <style> element (which reparses CSSOM rules).
    (doc.defaultView as ManagedDebugWindow).__designToolGetManagedSheetText = getManagedSheetText;
  }
  return sheet;
}

function buildDeclarationsBody(declarations: Record<string, string>): string {
  const parts: string[] = [];
  for (const [property, value] of Object.entries(declarations)) {
    const safeValue = String(value ?? "");
    const safeProperty = String(property ?? "");
    if (!safeProperty || !safeValue) continue;
    parts.push(`${safeProperty}: ${safeValue};`);
  }
  return parts.join(" ");
}

function buildRuleText(rule: StyleRule): string {
  const body = buildDeclarationsBody(rule.declarations);
  if (!body) return "";
  let text = `${rule.selector} { ${body} }`;
  for (const wrapper of [...(rule.context?.wrappers ?? [])].reverse()) {
    text = `@${wrapper.kind} ${wrapper.params} { ${text} }`;
  }
  return text;
}

export function rulesToCssText(rules: StyleRule[]): string {
  const lines: string[] = [];
  for (const rule of rules) {
    const text = buildRuleText(rule);
    if (text) lines.push(text);
  }
  return lines.join("\n");
}

/**
 * In-memory mirror of the managed sheet's rules. Each entry maps to exactly
 * one top-level CSSOM rule (a flat style rule, or an at-rule block holding a
 * single nested style rule). `index` is the rule's top-level position in
 * `sheet.cssRules`; `leaf` is the CSSStyleRule whose declarations back the
 * style (the top-level rule itself for flat rules, the innermost nested rule
 * for wrapped rules).
 */
interface ManagedRuleEntry {
  id: string;
  selector: string;
  wrappers?: TokenContextWrapper[];
  declarations: Record<string, string>;
  index: number;
  leaf: CSSStyleRule | null;
}

let managedSheetElement: HTMLElement | null = null;
let managedEntries: ManagedRuleEntry[] = [];

/** A rule is uniquely identified by its selector + wrappers + declared properties. */
function ruleIdentity(rule: StyleRule): string {
  const properties = Object.keys(rule.declarations).sort().join(",");
  return `${rule.selector}\u0000${JSON.stringify(rule.context?.wrappers ?? [])}\u0000${properties}`;
}

function declarationsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => b[key] === a[key]);
}

function leafRule(top: CSSRule | null, wrapperCount: number): CSSStyleRule | null {
  let current: CSSRule | null = top;
  for (let depth = 0; depth < wrapperCount && current; depth++) {
    current = (current as { cssRules?: CSSRuleList }).cssRules?.[0] ?? null;
  }
  return current as CSSStyleRule | null;
}

function entryToRule(entry: ManagedRuleEntry): StyleRule {
  return {
    selector: entry.selector,
    declarations: { ...entry.declarations },
    ...(entry.wrappers && entry.wrappers.length > 0
      ? { context: { wrappers: entry.wrappers } }
      : {}),
  };
}

/** Rebuild the model from a sheet that is assumed to contain exactly `rules` in order. */
function syncModelFromSheet(rules: StyleRule[], sheet: CSSStyleSheet): void {
  managedEntries = [];
  let index = 0;
  for (const rule of rules) {
    if (!buildRuleText(rule)) continue;
    const top = sheet.cssRules[index] ?? null;
    managedEntries.push({
      id: ruleIdentity(rule),
      selector: rule.selector,
      wrappers: rule.context?.wrappers,
      declarations: { ...rule.declarations },
      index,
      leaf: leafRule(top, rule.context?.wrappers?.length ?? 0),
    });
    index++;
  }
}

function syncEntryIndexes(): void {
  managedEntries.forEach((entry, index) => { entry.index = index; });
}

/** Synchronous serialized view of the rules currently projected into the managed sheet. */
export function getManagedSheetText(): string {
  return rulesToCssText(managedEntries.map(entryToRule));
}

/**
 * Full-sheet fallback used when CSSOM rejects a rule (for example an at-rule
 * a limited DOM does not implement). Keeps the sheet authoritative by
 * rebuilding it from serialized text, then re-syncs the model.
 */
function rebuildSheetText(rules: StyleRule[]): void {
  const el = document.getElementById(SHEET_ID) as HTMLStyleElement | null;
  if (!el) return;
  el.textContent = rulesToCssText(rules);
  managedSheetElement = el;
  if (el.sheet) syncModelFromSheet(rules, el.sheet);
  else managedEntries = [];
  notifyBrowserStylesheetChange(document);
}

/**
 * Writes the managed sheet incrementally: only rules whose identity or
 * declarations changed touch the CSSOM (insertRule / deleteRule / per-rule
 * declaration writes). The sheet stays last in `<head>` (keep-last guard in
 * `ensureManagedSheet`) and the cascade loses to author `!important` rules
 * exactly as the text-based projection did.
 */
export function applyRules(rules: StyleRule[]): void {
  const sheet = ensureManagedSheet();
  const el = document.getElementById(SHEET_ID) as HTMLElement | null;
  if (!el) return;
  let mutated = false;
  if (el !== managedSheetElement) {
    managedSheetElement = el;
    managedEntries = [];
    try {
      for (let index = sheet.cssRules.length - 1; index >= 0; index--) sheet.deleteRule(index);
    } catch {
      // A foreign rule or a limited CSSOM may reject deletion; assigning an
      // empty sheet remains recoverable and the desired rules are inserted
      // below in their canonical order.
      el.textContent = "";
    }
    mutated = true;
  }

  const desired: StyleRule[] = [];
  const desiredIds = new Set<string>();
  for (const rule of rules) {
    if (!buildRuleText(rule)) continue;
    const id = ruleIdentity(rule);
    if (desiredIds.has(id)) continue;
    desiredIds.add(id);
    desired.push(rule);
  }

  // Remove rules that no longer have a desired counterpart. Deleting in
  // descending index order keeps the surviving indexes stable while we go.
  const stale = managedEntries
    .filter((entry) => !desiredIds.has(entry.id))
    .sort((a, b) => b.index - a.index);
  if (stale.length > 0) {
    for (const entry of stale) {
      try {
        sheet.deleteRule(entry.index);
      } catch {
        rebuildSheetText(desired);
        return;
      }
    }
    managedEntries = managedEntries.filter((entry) => desiredIds.has(entry.id));
    syncEntryIndexes();
    mutated = true;
  }

  // Reconcile each desired rule at its canonical position. Existing rules are
  // moved with CSSOM delete/insert when their order changes; new rules are
  // inserted at the desired index rather than appended blindly.
  for (let index = 0; index < desired.length; index++) {
    const rule = desired[index]!;
    const id = ruleIdentity(rule);
    let currentIndex = managedEntries.findIndex((entry) => entry.id === id);

    if (currentIndex < 0) {
      const cssText = buildRuleText(rule);
      let top: CSSRule | null = null;
      try {
        sheet.insertRule(cssText, index);
        top = sheet.cssRules[index] ?? null;
      } catch {
        top = null;
      }
      if (!top) {
        rebuildSheetText(desired);
        return;
      }
      managedEntries.splice(index, 0, {
        id,
        selector: rule.selector,
        wrappers: rule.context?.wrappers,
        declarations: { ...rule.declarations },
        index,
        leaf: leafRule(top, rule.context?.wrappers?.length ?? 0),
      });
      syncEntryIndexes();
      mutated = true;
      currentIndex = index;
    } else if (currentIndex !== index) {
      const entry = managedEntries[currentIndex]!;
      const cssText = buildRuleText(entryToRule(entry));
      let top: CSSRule | null = null;
      try {
        sheet.deleteRule(currentIndex);
        sheet.insertRule(cssText, index);
        top = sheet.cssRules[index] ?? null;
      } catch {
        top = null;
      }
      if (!top) {
        rebuildSheetText(desired);
        return;
      }
      managedEntries.splice(currentIndex, 1);
      managedEntries.splice(index, 0, entry);
      entry.leaf = leafRule(top, entry.wrappers?.length ?? 0);
      syncEntryIndexes();
      mutated = true;
      currentIndex = index;
    }

    const entry = managedEntries[currentIndex]!;
    if (declarationsEqual(entry.declarations, rule.declarations)) continue;
    if (!entry.leaf) {
      rebuildSheetText(desired);
      return;
    }
    entry.leaf.style.cssText = buildDeclarationsBody(rule.declarations);
    entry.declarations = { ...rule.declarations };
    mutated = true;
  }

  if (mutated) {
    // CSSOM writes do not produce MutationRecords, so the revision-based
    // resolution caches must be invalidated explicitly (ADR-0003 panel
    // refresh depends on this revision bump).
    notifyBrowserStylesheetChange(document);
  }
}

function commaListIncludes(value: string, property: string): boolean {
  return value.split(",").map((part) => part.trim()).some((part) => part === "all" || part === property);
}

function hasImportantAuthorRule(el: HTMLElement, property: string): boolean {
  for (const sheet of Array.from(el.ownerDocument.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      try {
        if (el.matches(rule.selectorText) && rule.style.getPropertyPriority(property) === "important") return true;
      } catch { /* Ignore browser-specific selectors. */ }
    }
  }
  return false;
}

/** Verify what the browser painted after the managed sheet was projected. */
export function verifyPreview(el: HTMLElement | null, property: string, requestedValue: string): PreviewResult {
  if (!el || !el.isConnected) {
    return { requestedValue, computedValue: "", status: "conflict", reason: "target-missing" };
  }
  const computed = getElementComputedStyle(el);
  const computedValue = computed.getPropertyValue(property).trim();
  const doc = el.ownerDocument;
  const probe = doc.createElement(property.startsWith("--") ? "span" : el.tagName.toLowerCase());
  probe.setAttribute("data-design-tool", "value-probe");
  probe.style.setProperty(property, requestedValue);
  probe.style.setProperty("position", "fixed", "important");
  probe.style.setProperty("visibility", "hidden", "important");
  probe.removeAttribute("id");
  if (property.startsWith("--")) el.appendChild(probe);
  else el.parentElement?.insertBefore(probe, el.nextSibling);
  if (!probe.isConnected) doc.body.appendChild(probe);
  const expectedValue = getElementComputedStyle(probe).getPropertyValue(property).trim() || requestedValue.trim();
  probe.remove();
  if (computedValue === expectedValue) return { requestedValue, computedValue, status: "applied" };

  let reason: PreviewConflictReason = "higher-specificity";
  if (el.style.getPropertyPriority(property) === "important" || hasImportantAuthorRule(el, property)) reason = "important";
  else if (el.style.getPropertyValue(property)) reason = "inline-style";
  else if (typeof el.getAnimations === "function" && el.getAnimations().some((animation) => animation.playState !== "finished")) reason = "animation";
  else {
    const transitionProperty = computed.transitionProperty || el.style.transitionProperty;
    const transitionDuration = computed.transitionDuration || el.style.transitionDuration;
    if (commaListIncludes(transitionProperty, property) && transitionDuration !== "0s" && transitionDuration !== "") reason = "transition";
  }
  return { requestedValue, computedValue, status: "conflict", reason };
}

export function removeManagedSheet(): void {
  const el = document.getElementById(SHEET_ID);
  if (el) el.remove();
  managedSheetElement = null;
  managedEntries = [];
  notifyBrowserStylesheetChange(document);
}
