import { normalizeUrl, normalizedUrlKey } from "../canvas/normalizeUrl.ts";
import type { DraftContents } from "../changes/draftChanges.ts";

export type DraftTarget =
  | { readonly kind: "application"; readonly route: string }
  | { readonly kind: "html"; readonly artifactId: string; readonly path: string };

/** A draft's ID is its target key, so every frame showing the same page or iteration edits one draft. */
export interface Draft {
  readonly id: string;
  readonly target: DraftTarget;
  readonly revision: number;
  readonly contents: DraftContents;
  readonly sketchIds: readonly string[];
}

export interface DraftSnapshot {
  readonly projectId: string;
  readonly drafts: readonly Draft[];
}

const ARTIFACT_PATH = /^\/__nudge_ui__\/artifacts\/([a-f0-9-]{36})\//i;

export function applicationTarget(url: string = window.location.href): { kind: "application"; route: string } {
  const page = new URL(url, window.location.href);
  page.searchParams.delete("nudge-ui");
  page.searchParams.sort();
  const normalized = normalizeUrl(page.href)!;
  return { kind: "application", route: normalizedUrlKey(normalized) };
}

export function htmlTarget(artifactId: string): { kind: "html"; artifactId: string; path: string } {
  return { kind: "html", artifactId, path: `.nudge/artifacts/${artifactId}/document.html` };
}

/** Maps a captured document URL to the draft that owns it: an iteration preview or an application page. */
export function documentTarget(url: string): DraftTarget {
  const artifactId = ARTIFACT_PATH.exec(new URL(url, window.location.href).pathname)?.[1];
  return artifactId ? htmlTarget(artifactId) : applicationTarget(url);
}

export function targetKey(target: DraftTarget): string {
  return target.kind === "application" ? `application:${target.route}` : `html:${target.artifactId}`;
}

export function targetFromKey(key: string): DraftTarget | null {
  if (key.startsWith("html:")) return htmlTarget(key.slice("html:".length));
  if (!key.startsWith("application:")) return null;
  const target: DraftTarget = { kind: "application", route: key.slice("application:".length) };
  return isDraftTarget(target) ? target : null;
}

export function isDraftTarget(value: unknown): value is DraftTarget {
  if (!value || typeof value !== "object") return false;
  const target = value as Record<string, unknown>;
  if (target.kind === "application") {
    if (typeof target.route !== "string") return false;
    try { return applicationTarget(target.route).route === target.route; } catch { return false; }
  }
  return target.kind === "html" && typeof target.artifactId === "string"
    && target.path === `.nudge/artifacts/${target.artifactId}/document.html`;
}
