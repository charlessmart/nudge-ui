import { useSyncExternalStore } from "react";
import { DEBUG_VIEW_OFF, type DebugViewState } from "./debugView.ts";

let state: DebugViewState = DEBUG_VIEW_OFF;
const listeners = new Set<() => void>();

function publish(next: DebugViewState): void {
  if (next.outlines === state.outlines && next.xray === state.xray) return;
  state = next;
  for (const listener of listeners) listener();
}

export function getDebugViewState(): DebugViewState {
  return state;
}

export function subscribeDebugView(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDebugViewState(): DebugViewState {
  return useSyncExternalStore(subscribeDebugView, getDebugViewState, getDebugViewState);
}

export function setDebugOutlines(outlines: boolean): void {
  publish({ ...state, outlines });
}

/** Explode view and Animation both take over element clicks, so only one is on at a time. */
export function setDebugXray(xray: boolean): void {
  if (xray) setAnimationDebug({ enabled: false });
  publish({ ...state, xray });
}

/** Controller-only: the Animation tool reads the element selection directly, so renderers never see it. */
export interface AnimationDebugPrefs {
  readonly enabled: boolean;
  readonly speed: number;
}

let animation: AnimationDebugPrefs = { enabled: false, speed: 1 };
const animationListeners = new Set<() => void>();

export function getAnimationDebug(): AnimationDebugPrefs {
  return animation;
}

export function useAnimationDebug(): AnimationDebugPrefs {
  return useSyncExternalStore(
    (listener) => {
      animationListeners.add(listener);
      return () => animationListeners.delete(listener);
    },
    getAnimationDebug,
    getAnimationDebug,
  );
}

export function setAnimationDebug(patch: Partial<AnimationDebugPrefs>): void {
  const next = { ...animation, ...patch };
  if (next.enabled === animation.enabled && next.speed === animation.speed) return;
  const enabledChanged = next.enabled !== animation.enabled;
  animation = next;
  if (enabledChanged && next.enabled) publish({ ...state, xray: false });
  for (const listener of animationListeners) listener();
}
