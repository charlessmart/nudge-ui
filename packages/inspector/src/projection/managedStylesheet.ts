import { getElementComputedStyle } from "../runtime/domRealm.ts";
import { notifyBrowserStylesheetChange } from "../inspection/browserCssInspectionRegistry.ts";
import type { StyleRuleContext } from "../changes/editModel.ts";
import { escapeAttrValue, escapeCssString } from "./cssEscapes.ts";
import { isNudgeUiDev } from "../runtime/devFlag.ts";

export { escapeAttrValue, escapeCssString } from "./cssEscapes.ts";
export type { StyleRuleContext } from "../changes/editModel.ts";

declare global {
  interface Window {
    __nudgeUiGetManagedSheetText?: () => string;
  }
}


export interface StyleRule {
  selector: string;
  declarations: Record<string, string>;
  context?: StyleRuleContext;
}

export type PreviewConflictReason = "higher-specificity" | "inline-style" | "important" | "animation" | "transition" | "target-missing" | "token-drift";

export interface PreviewResult {
  requestedValue: string;
  computedValue: string;
  status: "applied" | "conflict";
  reason?: PreviewConflictReason;
}

const SHEET_ID = "nudge-ui-styles";

let managedHeadGuardDocument: Document | null = null;
let managedHeadGuard: MutationObserver | null = null;

function installManagedHeadGuard(doc: Document): void {
  const Observer = doc.defaultView?.MutationObserver;
  if (!Observer || !doc.head || managedHeadGuardDocument === doc) return;
  managedHeadGuard?.disconnect();
  managedHeadGuardDocument = doc;
  managedHeadGuard = new Observer(() => {
    const managed = doc.getElementById(SHEET_ID);
    if (managed && doc.head.lastElementChild !== managed) {
      doc.head.appendChild(managed);
      // SAFETY: managed was created via createElement("style"), so it is an HTMLStyleElement.
      rehydrateManagedSheet(doc, managed as HTMLStyleElement);
    }
  });
  managedHeadGuard.observe(doc.head, { childList: true });
}

export function ensureManagedSheet(): CSSStyleSheet {
  const doc = document;
  // SAFETY: getElementById returns an Element; the managed style element is created as HTMLStyleElement when missing.
  let el = doc.getElementById(SHEET_ID) as HTMLStyleElement | null;
  if (!el) {
    el = doc.createElement("style");
    el.id = SHEET_ID;
    el.setAttribute("data-nudge-ui", "managed");
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
    el.setAttribute("data-nudge-ui", "managed");
    doc.head.appendChild(el);
    sheet = el.sheet;
  }
  if (!sheet) {
    throw new Error("nudge-ui managed stylesheet could not be initialised");
  }
  if (doc.head.lastElementChild !== el) {
    doc.head.appendChild(el);
    rehydrateManagedSheet(doc, el);
  }
  installManagedHeadGuard(doc);
  if (isNudgeUiDev() && doc.defaultView) {
    // Keep the canonical CSS available to dev diagnostics.
    doc.defaultView.__nudgeUiGetManagedSheetText = getManagedSheetText;
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

/** Canonical rules retained so a framework can rehydrate a moved style node. */
let managedRules: StyleRule[] = [];

/** A rule is uniquely identified by its selector + wrappers + declared properties. */
function ruleIdentity(rule: StyleRule): string {
  const properties = Object.keys(rule.declarations).sort().join(",");
  return `${rule.selector}\u0000${JSON.stringify(rule.context?.wrappers ?? [])}\u0000${properties}`;
}

/** Synchronous serialized view of the rules currently projected into the managed sheet. */
export function getManagedSheetText(): string {
  return rulesToCssText(managedRules);
}

/**
 * Rehydrate the CSSOM after moving the managed style element in <head>.
 *
 * Some browsers replace the CSSStyleSheet when that element is reattached.
 * Rewriting the canonical text keeps the new sheet and the model aligned.
 */
function rehydrateManagedSheet(doc: Document, el: HTMLStyleElement): void {
  const sheet = el.sheet;
  if (!sheet) return;

  const rules = managedRules;
  const cssText = rulesToCssText(rules);
  const needsRebuild = el.textContent !== cssText || sheet.cssRules.length !== rules.length;

  if (needsRebuild) {
    el.textContent = cssText;
    if (!el.sheet) return;
    notifyBrowserStylesheetChange(doc);
  }
}

/**
 * Writes the canonical projection to the managed style element and retains a
 * copy for rehydration if a framework moves or reparses that element.
 */
function rebuildSheetText(rules: StyleRule[]): void {
  // SAFETY: getElementById returns an Element; the managed style element is created as HTMLStyleElement when missing.
  const el = document.getElementById(SHEET_ID) as HTMLStyleElement | null;
  if (!el) return;
  managedRules = rules.map((rule) => ({
    ...rule,
    declarations: { ...rule.declarations },
  }));
  el.textContent = rulesToCssText(managedRules);
  notifyBrowserStylesheetChange(document);
}

/**
 * Replaces the managed sheet with the canonical projection. Keeping the
 * serialized rules authoritative avoids stale CSSStyleRule references when a
 * framework dev server reparses or reattaches style nodes during a render.
 */
export function applyRules(rules: StyleRule[]): void {
  ensureManagedSheet();
  const desired: StyleRule[] = [];
  const desiredIds = new Set<string>();
  for (const rule of rules) {
    if (!buildRuleText(rule)) continue;
    const id = ruleIdentity(rule);
    if (desiredIds.has(id)) continue;
    desiredIds.add(id);
    desired.push(rule);
  }
  rebuildSheetText(desired);
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
  probe.setAttribute("data-nudge-ui", "value-probe");
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
  managedRules = [];
  notifyBrowserStylesheetChange(document);
}
