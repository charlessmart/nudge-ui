import type { MotionCondition } from "./animationScan.ts";

interface SavedState {
  readonly kind: "attribute" | "class";
  readonly name: string;
  readonly previous: string | null;
}

/** Clears and reapplies attribute or class switches together, so a switch that is already on still replays its transition. */
export function startMotionConditionPreview(
  trigger: HTMLElement,
  conditions: readonly MotionCondition[],
): () => void {
  const switched = conditions.filter((condition): condition is Exclude<MotionCondition, { kind: "pseudo" }> => condition.kind !== "pseudo");
  if (switched.length === 0) return () => undefined;

  const saved: SavedState[] = switched.map((condition) => condition.kind === "attribute"
    ? { kind: "attribute", name: condition.name, previous: trigger.getAttribute(condition.name) }
    : { kind: "class", name: condition.name, previous: trigger.classList.contains(condition.name) ? "" : null });

  for (const condition of switched) {
    if (condition.kind === "attribute") trigger.removeAttribute(condition.name);
    else trigger.classList.remove(condition.name);
  }
  // Committing the cleared state makes the reapplied switch start a new transition rather than coalescing to a no-op.
  void trigger.getBoundingClientRect();
  for (const condition of switched) {
    if (condition.kind === "attribute") trigger.setAttribute(condition.name, condition.value);
    else trigger.classList.add(condition.name);
  }

  return () => {
    for (const state of saved) {
      if (state.kind === "attribute") {
        if (state.previous === null) trigger.removeAttribute(state.name);
        else trigger.setAttribute(state.name, state.previous);
      } else if (state.previous === null) {
        trigger.classList.remove(state.name);
      } else {
        trigger.classList.add(state.name);
      }
    }
  };
}
