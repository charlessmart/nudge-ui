import { getActiveStyleState } from "./styleState.ts";
import { getResolvedPropertiesForState, getTokenTable } from "./tokens/resolution.ts";

/** Read an inspector value from the selected authored state, falling back to
 * the browser only when CSSOM has no declaration to attribute. */
export function getStateStyleValue(el: HTMLElement, property: string, fallback = ""): string {
  try {
    const state = getActiveStyleState();
    // Keep the browser's exact computed value for ordinary Base inspection.
    // Authored resolution is needed when the live element is transiently
    // interacted with, or when the user explicitly selected another state.
    const hasLiveInteraction = [":hover", ":active", ":focus", ":focus-visible"].some((selector) => {
      try { return el.matches(selector); } catch { return false; }
    });
    if (state === "base" && !hasLiveInteraction) {
      return getComputedStyle(el).getPropertyValue(property).trim() || fallback;
    }
    const rows = getResolvedPropertiesForState(el, getTokenTable(), state);
    const row = rows.find((candidate) => candidate.property === property)
      ?? (property === "background-color" ? rows.find((candidate) => candidate.property === "background") : undefined);
    if (row?.resolvedValue) return row.resolvedValue;
    return getComputedStyle(el).getPropertyValue(property).trim() || fallback;
  } catch {
    return fallback;
  }
}
