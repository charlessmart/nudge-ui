import { getActiveStyleState } from "../shell/styleState.ts";
import { getStateStyleValue } from "../shell/stateValue.ts";
import { getElementComputedStyle } from "../runtime/domRealm.ts";
import { readInspectionSnapshot } from "../inspection/inspectionSnapshot.ts";
import { INITIAL_LAYOUT_VALUES } from "./cssValue.ts";

/** Known layout properties never fall back to the browser's used pixel value. */
export function meaningfulLayoutValue(el: HTMLElement, property: string): string {
  const authored = readAuthoredStyleValue(el, property);
  if (authored) return authored;
  const computed = getStateStyleValue(el, property);
  // Aspect-ratio's computed value stays authored-like, unlike used dimensions such as a block's pixel width.
  if (property === "aspect-ratio" && computed && computed !== "auto") return computed;
  return INITIAL_LAYOUT_VALUES[property] ?? computed;
}

export function readAuthoredStyleValue(el: HTMLElement, property: string): string | null {
  try {
    const state = getActiveStyleState();
    const row = readInspectionSnapshot(el, state)?.properties
      .find((candidate) => candidate.property === property);
    const authored = row?.authored ?? row?.declaredValue;
    if (authored?.trim()) return authored.trim();
  } catch {
    // Reading CSSOM can throw on cross-origin stylesheets; fall through to explicit inline CSS.
  }

  const inline = el.style.getPropertyValue(property).trim();
  return inline || null;
}

export interface LayoutValue {
  property: string;
  authored: string | null;
  computed: string;
}

/** Authored CSS is the editable source of truth; computed is preview/fallback only. */
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
