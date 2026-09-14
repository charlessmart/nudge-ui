export const INTERACTION_STATES = ["hover", "active", "focus", "focus-visible", "disabled"] as const;

export type InteractionState = "base" | (typeof INTERACTION_STATES)[number];

let activeState: InteractionState = "base";

/** The selected authored interaction state. Kept outside React so edit actions
 * and history have the same context as the panel that initiated an edit. */
export function getActiveStyleState(): InteractionState {
  return activeState;
}

export function setActiveStyleState(state: InteractionState): void {
  activeState = state;
}

export function selectorForInteractionState(selector: string, state: InteractionState): string {
  return state === "base" ? selector : `${selector}:${state}`;
}
