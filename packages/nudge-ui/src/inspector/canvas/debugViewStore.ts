import { useSyncExternalStore } from "react";
import { clampDebugTimeScale, DEBUG_VIEW_OFF, type DebugViewState } from "./debugView.ts";

let state: DebugViewState = DEBUG_VIEW_OFF;
const listeners = new Set<() => void>();

function publish(next: DebugViewState): void {
  if (next.timeScale === state.timeScale && next.outlines === state.outlines && next.xray === state.xray) return;
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

export function setDebugTimeScale(timeScale: number): void {
  publish({ ...state, timeScale: clampDebugTimeScale(timeScale) });
}

export function setDebugOutlines(outlines: boolean): void {
  publish({ ...state, outlines });
}

export function setDebugXray(xray: boolean): void {
  publish({ ...state, xray });
}
