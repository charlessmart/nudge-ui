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
