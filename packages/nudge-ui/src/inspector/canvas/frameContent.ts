import { artifactDocumentUrl } from "../artifacts/client.ts";

/** Content identity is independent of frame geometry and its editable draft. */
export type FrameContent =
  | { kind: "route"; url: string; navigationUrl?: string }
  | { kind: "study"; artifactId: string; sourceUrl: string };

export function contentSourceUrl(content: FrameContent | undefined): string {
  return content ? content.kind === "route" ? content.url : content.sourceUrl : "";
}

export function studyArtifactId(content: FrameContent | undefined): string | undefined {
  return content?.kind === "study" ? content.artifactId : undefined;
}

export function contentNavigationUrl(content: FrameContent): string | undefined {
  return content.kind === "route" ? content.navigationUrl : undefined;
}

export function contentDocumentUrl(content: FrameContent): string {
  return content.kind === "route" ? content.navigationUrl ?? content.url : artifactDocumentUrl(content.artifactId);
}

export function contentEditTarget(content: FrameContent): { kind: "application" } | { kind: "html"; path: string; artifactId: string } {
  return content.kind === "route" ? { kind: "application" } : {
    kind: "html", path: `.nudge/artifacts/${content.artifactId}/document.html`, artifactId: content.artifactId,
  };
}

export function isFrameContent(value: unknown, origin: string): value is FrameContent {
  if (!value || typeof value !== "object") return false;
  const content = value as Record<string, unknown>;
  const url = content.kind === "route" ? content.url : content.sourceUrl;
  if (typeof url !== "string") return false;
  try { if (new URL(url).origin !== origin) return false; } catch { return false; }
  if (content.kind === "study") return typeof content.artifactId === "string" && /^[a-f0-9-]{36}$/i.test(content.artifactId);
  return content.kind === "route" && content.navigationUrl === undefined;
}
