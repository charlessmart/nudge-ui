import { useSyncExternalStore } from "react";
import { inspectorStorage } from "../runtime/inspectorStorage.ts";
import { isPageSurface } from "../canvas/pageSurface.ts";
import { isNudgeUiFeatureEnabled, type NudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";

export type NavigatorView = "frames" | "components";

const OPEN_KEY = "nudge-ui:navigator-open";
const VIEW_KEY = "nudge-ui:navigator-view";
const VIEWS: readonly NavigatorView[] = ["frames", "components"];

interface NavigatorState {
  readonly open: boolean;
  readonly view: NavigatorView;
}

const listeners = new Set<() => void>();
let state: NavigatorState = readStoredState();

function readStoredState(): NavigatorState {
  try {
    const storage = inspectorStorage();
    const view = storage?.getItem(VIEW_KEY);
    // Collapsed until someone opens it, so the page keeps the room. The old Pages and Flows views open as Frames.
    return { open: storage?.getItem(OPEN_KEY) === "1", view: VIEWS.find((candidate) => candidate === view) ?? "frames" };
  } catch {
    return { open: false, view: "frames" };
  }
}

function update(next: NavigatorState): void {
  if (next.open === state.open && next.view === state.view) return;
  state = next;
  try {
    inspectorStorage()?.setItem(OPEN_KEY, state.open ? "1" : "0");
    inspectorStorage()?.setItem(VIEW_KEY, state.view);
  } catch {
    // Without storage the navigator keeps its state for this load only.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getState(): NavigatorState {
  return state;
}

export function setNavigatorOpen(open: boolean): void {
  update({ ...state, open });
}

export function setNavigatorView(view: NavigatorView): void {
  update({ ...state, view });
}

export function useNavigatorState(): NavigatorState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** The navigator lives beside the Canvas. A page inspected in place (the Chrome extension) keeps the DOM navigator chip instead, as does a host that turns the feature off. */
export function isNavigatorAvailable(config: NudgeUiRuntimeConfig): boolean {
  return config.capabilities.canvas && !isPageSurface() && isNudgeUiFeatureEnabled(config.features, "navigator");
}
