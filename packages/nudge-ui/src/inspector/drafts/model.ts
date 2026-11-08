import { normalizeUrl, normalizedUrlKey } from "../canvas/normalizeUrl.ts";
import type { ChangeRecord } from "../changes/types.ts";
import type { StructuralChange } from "../changes/structuralTypes.ts";
import { isHtmlArtifactId } from "../../transport/artifacts.ts";
import { NUDGE_UI_ARTIFACTS_PATH } from "../../transport/routes.ts";

export interface DraftContents {
  readonly changes: readonly ChangeRecord[];
  readonly structuralChanges: readonly StructuralChange[];
}

export interface ApplicationTarget {
  readonly kind: "application";
  readonly route: string;
}

export interface HtmlTarget {
  readonly kind: "html";
  readonly artifactId: string;
  readonly path: string;
}

/** One shared draft for every component sheet frame; its source-site styles also project into live app frames. */
export interface ComponentsTarget {
  readonly kind: "components";
}

export type DraftTarget = ApplicationTarget | HtmlTarget | ComponentsTarget;

/** A draft's ID is its target key, so every frame showing the same page or iteration edits one draft. */
export interface Draft {
  readonly id: string;
  readonly target: DraftTarget;
  readonly revision: number;
  readonly contents: DraftContents;
}

export interface DraftSnapshot {
  readonly projectId: string;
  readonly drafts: readonly Draft[];
}

const COMPONENTS_PATH = "/__nudge_ui__/components";

export function applicationTarget(url: string = window.location.href): ApplicationTarget {
  const page = new URL(url, window.location.href);
  page.searchParams.delete("nudge-ui");
  page.searchParams.sort();
  const normalized = normalizeUrl(page.href)!;
  return { kind: "application", route: normalizedUrlKey(normalized) };
}

export function htmlTarget(artifactId: string): HtmlTarget {
  return { kind: "html", artifactId, path: `.nudge/artifacts/${artifactId}/document.html` };
}

export function artifactIdFromUrl(url: string): string | null {
  const path = new URL(url, window.location.href).pathname;
  const prefix = `${NUDGE_UI_ARTIFACTS_PATH}/`;
  if (!path.startsWith(prefix)) return null;
  const id = path.slice(prefix.length).split("/")[0];
  return isHtmlArtifactId(id) ? id : null;
}

export function componentsTarget(): ComponentsTarget {
  return { kind: "components" };
}

export function isComponentsUrl(url: string): boolean {
  const path = new URL(url, window.location.href).pathname;
  return path === COMPONENTS_PATH || path === `${COMPONENTS_PATH}/`;
}

export function documentTarget(url: string): DraftTarget {
  if (isComponentsUrl(url)) return componentsTarget();
  const artifactId = artifactIdFromUrl(url);
  return artifactId ? htmlTarget(artifactId) : applicationTarget(url);
}

export function targetKey(target: DraftTarget): string {
  if (target.kind === "components") return "components";
  return target.kind === "application" ? `application:${target.route}` : `html:${target.artifactId}`;
}

export function targetFromKey(key: string): DraftTarget | null {
  if (key === "components") return componentsTarget();
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
  if (target.kind === "components") return true;
  return target.kind === "html" && isHtmlArtifactId(target.artifactId)
    && target.path === `.nudge/artifacts/${target.artifactId}/document.html`;
}
