import type { InteractionState } from "../shell/styleState.ts";
import type { InspectionSnapshot } from "./browserCssInspection.ts";

const snapshots = new WeakMap<HTMLElement, InspectionSnapshot>();

/** Publishes the hook's completed refresh before its controls render. */
export function publishInspectionSnapshot(element: HTMLElement, snapshot: InspectionSnapshot): void {
  snapshots.set(element, snapshot);
}

/** Reads the current view without starting another cascade inspection. */
export function readInspectionSnapshot(element: HTMLElement, state: InteractionState): InspectionSnapshot | undefined {
  const snapshot = snapshots.get(element);
  return snapshot?.requestedState === state ? snapshot : undefined;
}
