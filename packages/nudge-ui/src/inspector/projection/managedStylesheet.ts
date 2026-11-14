import { getElementComputedStyle } from "../runtime/domRealm.ts";
import { notifyBrowserStylesheetChange } from "../inspection/browserCssInspectionRegistry.ts";
import type { StyleRuleContext } from "../changes/editModel.ts";
import { escapeAttrValue, escapeCssString } from "./cssEscapes.ts";
import { adoptStylesheet, allowsStyleElements, getAdoptedStylesheet, releaseAdoptedStylesheet } from "../runtime/ownedStylesheets.ts";
import { boostManagedStylesheet } from "./managedSpecificity.ts";

export { escapeAttrValue, escapeCssString } from "./cssEscapes.ts";
export type { StyleRuleContext } from "../changes/editModel.ts";

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

const adoptedCss = new WeakMap<Document, string>();

/** The one writer of the managed stylesheet. The renderer calls it with the CSS of the draft it was sent. */
export function writeManagedStylesheet(doc: Document, css: string): void {
  if (!allowsStyleElements(doc)) {
    // Structural and text projections resend unchanged CSS; rewriting it would discard cached resolutions.
    const adopted = getAdoptedStylesheet(doc, SHEET_ID);
    if (adopted && adoptedCss.get(doc) === css && doc.adoptedStyleSheets.includes(adopted)) return;
    const sheet = adoptStylesheet(doc, SHEET_ID, css);
    if (sheet) boostManagedStylesheet(doc, sheet);
    adoptedCss.set(doc, css);
    notifyBrowserStylesheetChange(doc);
    return;
  }
  // SAFETY: the element with this ID is only ever created below, as a style element.
  let el = doc.getElementById(SHEET_ID) as HTMLStyleElement | null;
  if (el?.textContent === css) return;
  if (!el) {
    el = doc.createElement("style");
    el.id = SHEET_ID;
    el.setAttribute("data-nudge-ui", "managed");
    doc.head.appendChild(el);
  }
  el.textContent = css;
  if (el.sheet) boostManagedStylesheet(doc, el.sheet);
  notifyBrowserStylesheetChange(doc);
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

function commaListIncludes(value: string, property: string): boolean {
  return value.split(",").map((part) => part.trim()).some((part) => part === "all" || part === property);
}

function hasImportantAuthorRule(el: HTMLElement, property: string): boolean {
  const StyleRule = el.ownerDocument.defaultView?.CSSStyleRule;
  if (!StyleRule) return false;
  for (const sheet of Array.from(el.ownerDocument.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof StyleRule)) continue;
      try {
        if (el.matches(rule.selectorText) && rule.style.getPropertyPriority(property) === "important") return true;
      } catch { /* Ignore browser-specific selectors. */ }
    }
  }
  return false;
}

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
  // A minimum of `auto` computes to `auto` on a flex or grid item and to `0px` everywhere else; the out-of-flow probe only ever shows the latter.
  if ((property === "min-width" || property === "min-height") && requestedValue.trim() === "auto" && computedValue === "auto") {
    return { requestedValue, computedValue, status: "applied" };
  }

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

export function removeManagedSheet(doc: Document = document): void {
  doc.getElementById(SHEET_ID)?.remove();
  releaseAdoptedStylesheet(doc, SHEET_ID);
  adoptedCss.delete(doc);
  notifyBrowserStylesheetChange(doc);
}
