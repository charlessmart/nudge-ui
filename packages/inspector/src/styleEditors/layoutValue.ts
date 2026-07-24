import { getStateStyleValue } from "../stateValue.ts";

const DEFAULT_LAYOUT_VALUES: Record<string, string> = {
  width: "auto",
  height: "auto",
  "min-width": "0",
  "min-height": "0",
  "max-width": "none",
  "max-height": "none",
  "aspect-ratio": "auto",
  top: "auto",
  right: "auto",
  bottom: "auto",
  left: "auto",
};

/**
 * Returns the authored CSS value when one is available, without replacing
 * keywords such as `auto` with the browser's used pixel value.
 */
export function meaningfulLayoutValue(el: HTMLElement, property: string): string {
  const authored = readAuthoredStyleValue(el, property);
  if (authored) return authored;
  const computed = getStateStyleValue(el, property);
  // Aspect-ratio's computed serialization remains a meaningful authored-like
  // value, unlike used dimensions such as a block's computed pixel width.
  if (property === "aspect-ratio" && computed && computed !== "auto") return computed;
  return DEFAULT_LAYOUT_VALUES[property] ?? computed;
}

export function readAuthoredStyleValue(el: HTMLElement, property: string): string | null {
  let value: string | null = null;
  const applyStyle = (style: CSSStyleDeclaration): void => {
    const next = style.getPropertyValue(property).trim();
    if (next) value = next;
  };

  const walk = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        try {
          if (el.matches(rule.selectorText)) applyStyle(rule.style);
        } catch {
          // Ignore selectors the current browser cannot evaluate.
        }
      } else if ("cssRules" in rule) {
        try {
          walk((rule as CSSGroupingRule).cssRules);
        } catch {
          // Ignore inaccessible cross-origin stylesheets.
        }
      }
    }
  };

  for (const sheet of Array.from(el.ownerDocument.styleSheets)) {
    try {
      walk(sheet.cssRules);
    } catch {
      // Ignore inaccessible cross-origin stylesheets.
    }
  }
  applyStyle(el.style);
  return value;
}
