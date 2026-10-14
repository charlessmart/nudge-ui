import { getActiveStyleState } from "./styleState.ts";
import { readInspectionSnapshot } from "../inspection/inspectionSnapshot.ts";
import { getElementComputedStyle } from "../runtime/domRealm.ts";

/** Reads from the authored state; the browser is only the fallback when CSSOM has no declaration to attribute. */
export function getStateStyleValue(el: HTMLElement, property: string, fallback = ""): string {
  try {
    const state = getActiveStyleState();
    // Base inspection uses the browser's computed value unless the element is transiently hovered or focused.
    const hasLiveInteraction = [":hover", ":active", ":focus", ":focus-visible"].some((selector) => {
      try { return el.matches(selector); } catch { return false; }
    });
    if (state === "base" && !hasLiveInteraction) {
      return getElementComputedStyle(el).getPropertyValue(property).trim() || fallback;
    }
    const rows = readInspectionSnapshot(el, state)?.properties ?? [];
    const row = rows.find((candidate) => candidate.property === property)
      ?? (property === "background-color" ? rows.find((candidate) => candidate.property === "background") : undefined);
    if (row?.resolvedValue) return row.resolvedValue;
    return getElementComputedStyle(el).getPropertyValue(property).trim() || fallback;
  } catch {
    return fallback;
  }
}
