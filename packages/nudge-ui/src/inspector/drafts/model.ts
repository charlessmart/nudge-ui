import { normalizeUrl, normalizedUrlKey } from "../canvas/normalizeUrl.ts";
import type { WorkspaceContents } from "../changes/workspaceChanges.ts";

export type DraftTarget =
  | { readonly kind: "application"; readonly route?: string }
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

export function applicationTarget(url: string = window.location.href): { kind: "application"; route: string } {
  const page = new URL(url, window.location.href);
  page.searchParams.delete("nudge-ui");
  page.searchParams.sort();
  const normalized = normalizeUrl(page.href)!;
  return { kind: "application", route: normalizedUrlKey(normalized) };
}

export function targetKey(target: DraftTarget): string {
  return target.kind === "application" ? `application:${target.route ?? ""}` : `html:${target.artifactId}`;
}

export function isDraftTarget(value: unknown): value is DraftTarget {
  if (!value || typeof value !== "object") return false;
  const target = value as Record<string, unknown>;
  if (target.kind === "application") {
    if (target.route === undefined) return true;
    if (typeof target.route !== "string") return false;
    try { return applicationTarget(target.route).route === target.route; } catch { return false; }
  }
  return target.kind === "html" && typeof target.artifactId === "string"
    && target.path === `.nudge/artifacts/${target.artifactId}/document.html`;
}
