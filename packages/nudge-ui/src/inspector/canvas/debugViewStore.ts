import { useSyncExternalStore } from "react";

/** What the view tool shows: element outlines, or the page's layers pulled apart. */
export type DebugViewMode = "outlines" | "explode";

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

// Which view the tool applies. Outline view, Explode view and Animation are separate tools, so only one is ever active; the tool selection lives with the canvas and this is just the view the tool will show when it is.
const viewMode = createStore<DebugViewMode>("outlines");

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

/** Controller-only: a renderer has pulled a subtree apart, so element chrome the controller draws flat over the frame would only sit on top of the exploded layers. */
const exploded = createStore<boolean>(false);

export const getDebugExploded = exploded.get;
export const setDebugExploded = exploded.set;
export const useDebugExploded = exploded.use;
