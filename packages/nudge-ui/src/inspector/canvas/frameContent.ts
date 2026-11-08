import { applicationTarget, componentsTarget, htmlTarget, type DraftTarget } from "../drafts/model.ts";
import { artifactDocumentUrl } from "../iterations/client.ts";
import type { FlowScenario, FlowStep } from "../../transport/flows.ts";

/** Which flow state a route frame shows. A copy of the file's recipe, so a restored frame loads before the file is read. */
export interface FlowStateBinding {
  readonly flowId: string;
  readonly stateId: string;
  readonly flowTitle: string;
  readonly label: string;
  readonly tag?: string;
  readonly route: string;
  readonly expectRoute?: string;
  readonly scenario: FlowScenario;
  readonly steps: readonly FlowStep[];
}

export type FrameContent =
  | { kind: "route"; url: string; navigationUrl?: string; flowState?: FlowStateBinding }
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
  // Different states of one page are not breakpoints of one view.
  if (active.content.flowState) return [];
  const matching = frames.filter((frame) => frame.content.kind === "route" && !frame.content.flowState
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
  if (content.flowState !== undefined && !isFlowStateBinding(content.flowState)) return false;
  return content.kind === "route" && content.navigationUrl === undefined;
}

function isFlowStateBinding(value: unknown): value is FlowStateBinding {
  if (!value || typeof value !== "object") return false;
  const binding = value as Record<string, unknown>;
  return typeof binding.flowId === "string" && typeof binding.stateId === "string"
    && typeof binding.flowTitle === "string" && typeof binding.label === "string"
    && typeof binding.route === "string" && Array.isArray(binding.steps)
    && typeof binding.scenario === "object" && binding.scenario !== null;
}

export function flowStateOf(content: FrameContent | undefined): FlowStateBinding | undefined {
  return content?.kind === "route" ? content.flowState : undefined;
}

/** A flow state belongs to its recipe's route, wherever its steps last took the frame. */
export function flowRouteUrl(binding: FlowStateBinding): string {
  return new URL(binding.route, window.location.origin).href;
}

/** Where a frame loads from: a flow state always starts over at its route. */
export function contentStartUrl(content: FrameContent): string {
  const flow = flowStateOf(content);
  return flow ? flowRouteUrl(flow) : contentSourceUrl(content);
}

/** Changes whenever the recipe does, which is what makes a frame start over. */
export function flowStateRevision(binding: FlowStateBinding | undefined): string | null {
  return binding ? JSON.stringify([binding.route, binding.expectRoute, binding.scenario, binding.steps]) : null;
}
