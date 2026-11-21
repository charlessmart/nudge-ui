import { useSyncExternalStore } from "react";

/**
 * Navigator sections and flows the person opened or closed, keyed to whether each is
 * now collapsed. Anything they haven't touched keeps its default. Kept outside React so
 * switching the panel's view keeps them as they were.
 */
const choices = new Map<string, boolean>();
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function isCollapsed(key: string, collapsedByDefault = false): boolean {
  return choices.get(key) ?? collapsedByDefault;
}

export function toggleCollapsed(key: string, collapsedByDefault = false): void {
  choices.set(key, !isCollapsed(key, collapsedByDefault));
  notify();
}

export function useCollapsed(key: string, collapsedByDefault = false): boolean {
  useSyncExternalStore(subscribe, () => version);
  return isCollapsed(key, collapsedByDefault);
}

/** Reads many keys at once, for lists; re-renders when any of them changes. */
export function useCollapseState(): typeof isCollapsed {
  useSyncExternalStore(subscribe, () => version);
  return isCollapsed;
}

/** Test hook: every section and flow goes back to its default. */
export function resetCollapsed(): void {
  choices.clear();
  notify();
}
