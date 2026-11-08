import { useSyncExternalStore } from "react";

export type InspectorTab = "pages" | "components" | "styles" | "tokens";

const STORAGE_KEY = "nudge-ui:inspector-tab";
const TABS: readonly InspectorTab[] = ["pages", "components", "styles", "tokens"];
const listeners = new Set<() => void>();
let tab = readStoredTab();

function readStoredTab(): InspectorTab {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return TABS.find((candidate) => candidate === stored) ?? "styles";
  } catch {
    return "styles";
  }
}

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
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value);
  } catch {
    // The tab still switches for this session when storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

export function useInspectorTab(): InspectorTab {
  return useSyncExternalStore(subscribe, getInspectorTab, getInspectorTab);
}
