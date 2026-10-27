import { useSyncExternalStore } from "react";

/** What the view tool shows: the page's animations, element outlines, or the page's layers pulled apart. */
export type DebugViewMode = "animation" | "outlines" | "explode";

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

// Which view the tool applies. Animation, Outline view and Explode view share one tool, so only one is ever active;
// the tool selection lives with the canvas and this is just the view the tool will show when it is.
const viewMode = createStore<DebugViewMode>("animation");

export const getDebugViewMode = viewMode.get;
export const setDebugViewMode = viewMode.set;
export const useDebugViewMode = viewMode.use;

// Controller-only: the Animation tool reads the element selection directly, so renderers never see the speed.
const animationSpeed = createStore<number>(1);

export const getAnimationSpeed = animationSpeed.get;
export const setAnimationSpeed = animationSpeed.set;
export const useAnimationSpeed = animationSpeed.use;

/** Controller-only: the animation bar is playing or being scrubbed, so the page's markers and element label step aside. */
const animationBusy = createStore<boolean>(false);

export const getAnimationBusy = animationBusy.get;
export const setAnimationBusy = animationBusy.set;
export const useAnimationBusy = animationBusy.use;

/** Controller-only: the animation bar's rendered height, 0 while it is closed, so toasts rise above it rather than cover it. */
const animationBarHeight = createStore<number>(0);

export const setAnimationBarHeight = animationBarHeight.set;
export const useAnimationBarHeight = animationBarHeight.use;
