import { useSyncExternalStore } from "react";
import type { AgentActivity } from "./protocol.ts";

export interface ActivityFile extends AgentActivity { readonly expiresAt: number }
export interface AgentActivitySnapshot {
  readonly requestId: string | null;
  readonly targets: readonly string[];
  readonly files: readonly ActivityFile[];
}
const EMPTY: AgentActivitySnapshot = Object.freeze({ requestId: null, targets: [], files: [] });
interface ProjectActivity {
  snapshot: AgentActivitySnapshot;
  dispatch?: { id: string; targets: readonly string[] };
  timer?: ReturnType<typeof setTimeout>;
  listeners: Set<() => void>;
}
const projects = new Map<string, ProjectActivity>();
function project(id: string): ProjectActivity {
  let state = projects.get(id);
  if (!state) { state = { snapshot: EMPTY, listeners: new Set() }; projects.set(id, state); }
  return state;
}
function publish(state: ProjectActivity, snapshot: AgentActivitySnapshot): void {
  state.snapshot = snapshot;
  for (const listener of state.listeners) listener();
}

/** Pins submitted frames before dispatch. Activity never selects or edits a draft. */
export function beginActivityDispatch(projectId: string, dispatchId: string, targets: readonly string[]): void {
  project(projectId).dispatch = { id: dispatchId, targets: [...targets] };
}

/** Dispatch and status are the only authority for the layer's lifetime. */
export function synchronizeAgentActivity(projectId: string, requestId: string | undefined, working: boolean, dispatchId?: string): void {
  const state = project(projectId);
  if (!working || !requestId) {
    if (state.timer) clearTimeout(state.timer);
    state.timer = undefined;
    state.dispatch = undefined;
    if (state.snapshot !== EMPTY) publish(state, EMPTY);
    return;
  }
  if (state.snapshot.requestId === requestId) return;
  if (state.timer) clearTimeout(state.timer);
  const targets = state.dispatch && state.dispatch.id === dispatchId ? state.dispatch.targets : [];
  publish(state, { requestId, targets, files: [] });
}

export function reportAgentActivity(projectId: string, activity: AgentActivity): void {
  const state = project(projectId);
  if (state.snapshot.requestId !== activity.requestId) return;
  const now = Date.now();
  const files = state.snapshot.files.filter((file) => file.expiresAt > now && file.file !== activity.file);
  files.push({ ...activity, expiresAt: now + (activity.operation === "read" ? 8_000 : 12_000) });
  publish(state, { ...state.snapshot, files: files.slice(-64) });
  scheduleExpiry(state);
}
function scheduleExpiry(state: ProjectActivity): void {
  if (state.timer) clearTimeout(state.timer);
  const deadline = Math.min(...state.snapshot.files.map((file) => file.expiresAt));
  if (!Number.isFinite(deadline)) { state.timer = undefined; return; }
  state.timer = setTimeout(() => {
    publish(state, { ...state.snapshot, files: state.snapshot.files.filter((file) => file.expiresAt > Date.now()) });
    scheduleExpiry(state);
  }, Math.max(0, deadline - Date.now()));
}
export function getAgentActivity(projectId: string): AgentActivitySnapshot { return project(projectId).snapshot; }
export function useAgentActivity(projectId: string): AgentActivitySnapshot {
  return useSyncExternalStore((listener) => {
    const state = project(projectId); state.listeners.add(listener);
    return () => { state.listeners.delete(listener); };
  }, () => getAgentActivity(projectId), () => EMPTY);
}
