import { getActiveStyleState } from "../styleState.ts";
import { getStateStyleValue } from "../stateValue.ts";
import { getElementComputedStyle } from "../domRealm.ts";
import { getResolvedPropertiesForState, getTokenTable } from "../tokens/resolution.ts";

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
  try {
    const state = getActiveStyleState();
    const row = getResolvedPropertiesForState(el, getTokenTable(), state)
      .find((candidate) => candidate.property === property);
    const authored = row?.authored ?? row?.declaredValue;
    if (authored?.trim()) return authored.trim();
  } catch {
    // CSSOM can reject cross-origin stylesheets. Fall through to explicit
    // inline CSS and the computed-value fallback used by the field layer.
  }

  const inline = el.style.getPropertyValue(property).trim();
  return inline || null;
}

export interface LayoutValue {
  property: string;
  authored: string | null;
  computed: string;
}

/**
 * Reads both representations needed by a layout editor. Authored CSS is the
 * editable source of truth; computed CSS is only the browser preview/fallback.
 */
export function getLayoutValue(el: HTMLElement, property: string): LayoutValue {
  const authored = readAuthoredStyleValue(el, property);
  let computed = "";
  try {
    computed = getElementComputedStyle(el).getPropertyValue(property).trim();
  } catch {
    computed = getStateStyleValue(el, property);
  }
  return { property, authored, computed };
}
