import { useSyncExternalStore } from "react";

function createStore<T>(initial: T): {
  get: () => T;
  set: (next: T) => void;
  use: () => T;
} {
  let value = initial;
  const listeners = new Set<() => void>();
  const get = (): T => value;
  return {
    get,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    use: () => useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      get,
      get,
    ),
  };
}

// The Inspection tool's views. Each is switched on and off on its own and only applied while the tool is active.
// Outlines and spacing are kept while the tool is put away; Explode is switched off, the speed set back to full and animations resumed.
const outlinesView = createStore<boolean>(false);

export const getOutlinesView = outlinesView.get;
export const setOutlinesView = outlinesView.set;
export const useOutlinesView = outlinesView.use;

const explodeView = createStore<boolean>(false);

export const getExplodeView = explodeView.get;
export const setExplodeView = explodeView.set;
export const useExplodeView = explodeView.use;

const spacingView = createStore<boolean>(false);

export const getSpacingView = spacingView.get;
export const setSpacingView = spacingView.set;
export const useSpacingView = spacingView.use;

/** The speed the Inspection tool slows the page to, applied only while the tool is active. */
export const DEFAULT_ANIMATION_SPEED = 0.3;
const animationSpeed = createStore<number>(DEFAULT_ANIMATION_SPEED);

export const getAnimationSpeed = animationSpeed.get;
export const setAnimationSpeed = animationSpeed.set;
export const useAnimationSpeed = animationSpeed.use;

/** Holds every animation where it is without losing the speed the slider is set to; applied only while the Inspection tool is active. */
const animationsPaused = createStore<boolean>(false);

export const getAnimationsPaused = animationsPaused.get;
export const setAnimationsPaused = animationsPaused.set;
export const useAnimationsPaused = animationsPaused.use;

/** Controller-only: the inspection bar's rendered height, 0 while it is closed, so toasts rise above it rather than cover it. */
const inspectionBarHeight = createStore<number>(0);

export const setInspectionBarHeight = inspectionBarHeight.set;
export const useInspectionBarHeight = inspectionBarHeight.use;
