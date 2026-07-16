export interface StyleRule {
  selector: string;
  declarations: Record<string, string>;
  context?: StyleRuleContext;
}

export interface StyleRuleContext {
  media?: string;
  supports?: string;
  scope?: string;
  layer?: string;
}

export type PreviewConflictReason = "higher-specificity" | "inline-style" | "important" | "animation" | "transition" | "target-missing";

export interface PreviewResult {
  requestedValue: string;
  computedValue: string;
  status: "applied" | "conflict";
  reason?: PreviewConflictReason;
}

const SHEET_ID = "design-tool-styles";

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
  return sheet;
}

export function escapeAttrValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\]/g, "\\]");
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
  if (rule.context?.scope) text = `@scope ${rule.context.scope} { ${text} }`;
  if (rule.context?.supports) text = `@supports ${rule.context.supports} { ${text} }`;
  if (rule.context?.media) text = `@media ${rule.context.media} { ${text} }`;
  if (rule.context?.layer) text = `@layer ${rule.context.layer} { ${text} }`;
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

export function applyRules(rules: StyleRule[]): void {
  ensureManagedSheet();
  const el = document.getElementById(SHEET_ID) as HTMLStyleElement | null;
  if (!el) return;
  const text = rulesToCssText(rules);
  el.textContent = text;
}

function commaListIncludes(value: string, property: string): boolean {
  return value.split(",").map((part) => part.trim()).some((part) => part === "all" || part === property);
}

function hasImportantAuthorRule(el: HTMLElement, property: string): boolean {
  for (const sheet of Array.from(document.styleSheets)) {
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
  const computed = getComputedStyle(el);
  const computedValue = computed.getPropertyValue(property).trim();
  const probe = document.createElement(property.startsWith("--") ? "span" : el.tagName.toLowerCase());
  probe.setAttribute("data-design-tool", "value-probe");
  probe.style.setProperty(property, requestedValue);
  probe.style.setProperty("position", "fixed", "important");
  probe.style.setProperty("visibility", "hidden", "important");
  probe.removeAttribute("id");
  if (property.startsWith("--")) el.appendChild(probe);
  else el.parentElement?.insertBefore(probe, el.nextSibling);
  if (!probe.isConnected) document.body.appendChild(probe);
  const expectedValue = getComputedStyle(probe).getPropertyValue(property).trim() || requestedValue.trim();
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
}
