import { useSyncExternalStore } from "react";

export type InspectorTab = "pages" | "components" | "styles" | "tokens";

const listeners = new Set<() => void>();
// The panel always opens on Styles; a switch to another tab lasts until the page reloads.
let tab: InspectorTab = "styles";

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getInspectorTab(): InspectorTab {
  return tab;
}

export function setInspectorTab(value: InspectorTab): void {
  if (tab === value) return;
  tab = value;
  listeners.forEach((listener) => listener());
}

export function useInspectorTab(): InspectorTab {
  return useSyncExternalStore(subscribe, getInspectorTab, getInspectorTab);
}
