import type { ProjectSession, StoredProjectSession } from "./project.ts";

/** Canonical paths resolved before discovery or selection. */
export interface SessionScope {
  readonly workspaceRoot: string;
  readonly applicationRoot: string;
}

interface SelectionOptions extends SessionScope {
  readonly requestedSessionId?: string;
  readonly previousSession?: Pick<ProjectSession, "sessionId" | "appRoot">;
}

/** A workspace-root adapter can select any application in that exact workspace. */
export function matchesApplication(session: ProjectSession, scope: SessionScope): boolean {
  return session.workspaceRoot === scope.workspaceRoot
    && (scope.applicationRoot === scope.workspaceRoot || session.appRoot === scope.applicationRoot);
}

/** Chooses a live session without accessing files, making requests, or claiming it. */
export function selectProjectSession(
  sessions: readonly StoredProjectSession[],
  options: SelectionOptions,
): StoredProjectSession {
  const candidates = sessions.filter((session) => matchesApplication(session, options));
  const applicationScoped = options.applicationRoot !== options.workspaceRoot;

  if (options.requestedSessionId) {
    const requested = candidates.find((session) => session.sessionId === options.requestedSessionId);
    if (requested) return requested;
    throw new Error(applicationScoped
      ? "The selected Nudge session is not live for this exact application."
      : "The selected Nudge session is not live in this exact workspace.");
  }

  if (options.previousSession) return restoreSelection(candidates, options.previousSession);
  if (candidates.length === 1) return candidates[0]!;

  if (!sessions.some((session) => session.workspaceRoot === options.workspaceRoot)) {
    throw new Error("No live Nudge project session matches this exact workspace. Start the project development server first.");
  }
  if (candidates.length === 0 && applicationScoped) {
    throw new Error("No live Nudge project session matches this exact application. Start its development server first.");
  }
  throw new Error("Several Nudge apps are running in this workspace. Call nudge_list_sessions, then pass sessionId to nudge_listen.");
}

function restoreSelection(
  candidates: readonly StoredProjectSession[],
  previous: Pick<ProjectSession, "sessionId" | "appRoot">,
): StoredProjectSession {
  const current = candidates.find((session) => session.sessionId === previous.sessionId);
  if (current) return current;

  const replacements = candidates.filter((session) => session.appRoot === previous.appRoot);
  if (replacements.length === 1) return replacements[0]!;
  if (replacements.length > 1) {
    throw new Error("Several restarted Nudge sessions match the selected app. Pass sessionId explicitly.");
  }
  throw new Error("The previously selected Nudge app is no longer running.");
}
