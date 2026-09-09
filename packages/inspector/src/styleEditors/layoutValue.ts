import { getActiveStyleState } from "../styleState.ts";
import { getStateStyleValue } from "../stateValue.ts";
import { getElementComputedStyle } from "../domRealm.ts";
import { getBrowserCssInspection } from "../inspection/browserCssInspectionRegistry.ts";
import type { StringListRecord, StringRecord } from "./stringRecord.ts";

const DEFAULT_LAYOUT_VALUES: StringRecord = {
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
    const row = getBrowserCssInspection(el.ownerDocument ?? document)
      .inspect(el, { state }).properties
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

/**
 * Shorthands that also author the keyed longhand when present in a `style`
 * attribute. Managed-stylesheet previews lose the cascade to any of these,
 * so fields must treat the longhand as inline-blocked either way.
 */
const INLINE_SHORTHAND_SOURCES: StringListRecord = {
  "row-gap": ["gap"],
  "column-gap": ["gap"],
  "margin-top": ["margin"],
  "margin-right": ["margin"],
  "margin-bottom": ["margin"],
  "margin-left": ["margin"],
  "padding-top": ["padding"],
  "padding-right": ["padding"],
  "padding-bottom": ["padding"],
  "padding-left": ["padding"],
  top: ["inset"],
  right: ["inset"],
  bottom: ["inset"],
  left: ["inset"],
};

/**
 * Returns the inline-authored source when `el` carries the property — or a
 * shorthand that sets it — in its `style` attribute. Managed previews can
 * never beat inline styles in the cascade, so a non-null result means the
 * field must present as blocked instead of accepting edits that silently
 * revert (see `verifyPreview`'s "inline-style" conflict).
 */
export function inlineAuthoredValue(el: HTMLElement, property: string): string | null {
  const direct = el.style.getPropertyValue(property).trim();
  if (direct) return `${property}: ${direct}`;
  for (const shorthand of INLINE_SHORTHAND_SOURCES[property] ?? []) {
    const value = el.style.getPropertyValue(shorthand).trim();
    if (value) return `${shorthand}: ${value}`;
  }
  return null;
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
