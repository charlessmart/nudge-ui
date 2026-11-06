import { SHEET_STATE_ATTRIBUTE } from "../../componentSheet/stateStyles.ts";

export const INTERACTION_STATES = ["hover", "active", "focus", "focus-visible", "disabled"] as const;

export type InteractionState = "base" | (typeof INTERACTION_STATES)[number];

let activeState: InteractionState = "base";

/** Kept outside React so edit actions and history share the panel's context. */
export function getActiveStyleState(): InteractionState {
  return activeState;
}

export function setActiveStyleState(state: InteractionState): void {
  activeState = state;
}

export function selectorForInteractionState(selector: string, state: InteractionState): string {
  return state === "base" ? selector : `${selector}:${state}`;
}

/**
 * Keeps a rule off the states that set the property themselves. A component sheet forces a state through an ancestor
 * attribute rather than the pseudo-class, so the guard excludes that too.
 */
export function selectorExcludingStates(selector: string, states: readonly InteractionState[]): string {
  return states.filter((state) => state !== "base").reduce((guarded, state) => {
    const forced = state === "focus" ? "focus-visible" : state;
    return `${guarded}:not(:${state}, [${SHEET_STATE_ATTRIBUTE}="${forced}"] *)`;
  }, selector);
}
