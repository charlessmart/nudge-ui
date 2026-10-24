import { useSyncExternalStore } from "react";
import type { DraftTarget } from "../drafts/model.ts";

/** One source file an agent reported touching. */
export interface AgentActivity {
  readonly file: string;
  readonly operation: "read" | "edit";
  readonly line?: number;
  readonly endLine?: number;
  readonly componentId?: string;
}

export interface ActivityFile extends AgentActivity { readonly expiresAt: number }

/**
 * Agent working state for one project. The overlay renders when `sessionId` is set;
 * no transport feeds this store yet, so it stays empty until the file-based
 * activity source lands.
 */
export interface AgentActivitySnapshot {
  readonly sessionId: string | null;
  readonly targets: readonly string[];
  readonly target?: DraftTarget;
  readonly files: readonly ActivityFile[];
}

const EMPTY: AgentActivitySnapshot = Object.freeze({ sessionId: null, targets: [], target: undefined, files: [] });
interface ProjectActivity { snapshot: AgentActivitySnapshot; timer?: ReturnType<typeof setTimeout>; listeners: Set<() => void> }
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

/** Pins the frames a handoff covers before the agent reports any file. */
export function beginAgentActivity(projectId: string, targets: readonly string[], target?: DraftTarget, sessionId = `activity-${Date.now()}`): string {
  const state = project(projectId);
  if (state.timer) clearTimeout(state.timer);
  state.timer = undefined;
  publish(state, { sessionId, targets: [...targets], ...(target ? { target } : {}), files: [] });
  return sessionId;
}

export function reportAgentActivity(projectId: string, activity: AgentActivity): void {
  const state = project(projectId);
  if (state.snapshot.sessionId === null) return;
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

/** Clears the working state; the dispatch owner calls this when the run ends. */
export function endAgentActivity(projectId: string): void {
  const state = project(projectId);
  if (state.timer) clearTimeout(state.timer);
  state.timer = undefined;
  if (state.snapshot.sessionId !== null) publish(state, EMPTY);
}

export function getAgentActivity(projectId: string): AgentActivitySnapshot { return project(projectId).snapshot; }

export function useAgentActivity(projectId: string): AgentActivitySnapshot {
  return useSyncExternalStore((listener) => {
    const state = project(projectId); state.listeners.add(listener);
    return () => { state.listeners.delete(listener); };
  }, () => getAgentActivity(projectId), () => EMPTY);
}
