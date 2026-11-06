import { applicationTarget, componentsTarget, htmlTarget, type DraftTarget } from "../drafts/model.ts";
import { artifactDocumentUrl } from "../iterations/client.ts";

export type FrameContent =
  | { kind: "route"; url: string; navigationUrl?: string }
  | { kind: "iteration"; artifactId: string; sourceUrl: string }
  | { kind: "component"; componentId: string; name: string };

/** Mirrors NUDGE_UI_COMPONENTS_PATH from the transport routes. */
const COMPONENTS_PATH = "/__nudge_ui__/components";

export function componentSheetUrl(componentId: string): string {
  return `${window.location.origin}${COMPONENTS_PATH}?component=${encodeURIComponent(componentId)}`;
}

export function componentId(content: FrameContent | undefined): string | undefined {
  return content?.kind === "component" ? content.componentId : undefined;
}

export function contentSourceUrl(content: FrameContent | undefined): string {
  if (!content) return "";
  if (content.kind === "route") return content.url;
  return content.kind === "component" ? componentSheetUrl(content.componentId) : content.sourceUrl;
}

export function iterationId(content: FrameContent | undefined): string | undefined {
  return content?.kind === "iteration" ? content.artifactId : undefined;
}

export function contentNavigationUrl(content: FrameContent): string | undefined {
  return content.kind === "route" ? content.navigationUrl : undefined;
}

export function contentDocumentUrl(content: FrameContent): string {
  if (content.kind === "component") return componentSheetUrl(content.componentId);
  return content.kind === "route" ? content.navigationUrl ?? content.url : artifactDocumentUrl(content.artifactId);
}

export function contentEditTarget(content: FrameContent): DraftTarget {
  if (content.kind === "component") return componentsTarget();
  return content.kind === "route" ? applicationTarget(content.url) : htmlTarget(content.artifactId);
}

export function getLinkedFrameIds(
  frames: readonly { id: string; content: FrameContent }[],
  activeId: string | null,
): readonly string[] {
  const active = frames.find((frame) => frame.id === activeId);
  if (active?.content.kind !== "route") return [];
  const route = applicationTarget(active.content.url).route;
  const matching = frames.filter((frame) => frame.content.kind === "route"
    && applicationTarget(frame.content.url).route === route);
  return matching.length > 1 ? matching.map((frame) => frame.id) : [];
}

export function isFrameContent(value: unknown, origin: string): value is FrameContent {
  if (!value || typeof value !== "object") return false;
  const content = value as Record<string, unknown>;
  if (content.kind === "component") {
    return typeof content.componentId === "string" && content.componentId.length > 0 && content.componentId.length <= 512
      && typeof content.name === "string";
  }
  const url = content.kind === "route" ? content.url : content.sourceUrl;
  if (typeof url !== "string") return false;
  try { if (new URL(url).origin !== origin) return false; } catch { return false; }
  if (content.kind === "iteration") return typeof content.artifactId === "string" && /^[a-f0-9-]{36}$/i.test(content.artifactId);
  return content.kind === "route" && content.navigationUrl === undefined;
}
