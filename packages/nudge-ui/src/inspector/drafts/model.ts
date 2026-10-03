import type { WorkspaceContents } from "../changes/workspaceChanges.ts";

export type DraftTarget =
  | { readonly kind: "application" }
  | { readonly kind: "html"; readonly artifactId: string; readonly path: string };

export interface Draft {
  readonly id: string;
  readonly target: DraftTarget;
  readonly revision: number;
  readonly contents: WorkspaceContents;
  readonly sketchIds: readonly string[];
}

export interface DraftSnapshot {
  readonly projectId: string;
  readonly drafts: readonly Draft[];
}

export function targetKey(target: DraftTarget): string {
  return target.kind === "application" ? "application" : `html:${target.artifactId}`;
}

export function isDraftTarget(value: unknown): value is DraftTarget {
  if (!value || typeof value !== "object") return false;
  const target = value as Record<string, unknown>;
  return target.kind === "application" || (target.kind === "html" && typeof target.artifactId === "string"
    && target.path === `.nudge/artifacts/${target.artifactId}/document.html`);
}
