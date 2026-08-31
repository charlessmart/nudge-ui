import { isDocumentProjectionReport } from "../renderedInstance.ts";
import { isTextProjectionReport } from "../textProjection.ts";
import { isStructuralProjectionReport } from "../structuralProjectionBoundary.ts";
import type { ComponentOverride } from "../componentSemantics/types.ts";

// v13 adds source-parent-aware structural moves and bounded structural failure
// reasons to the full projection snapshot. v12 added the projection-applied
// acknowledgement: the controller can avoid
// rereading a Canvas iframe until the renderer has applied its revision. v11
// added the renderer-hello handshake solicitation for runtimes whose boot
// completes after the controller's load-time parent-ready.
export const PROTOCOL_VERSION = 13;

export interface FrameMessage {
  type: string;
  protocolVersion: number;
}

/**
 * Pre-identity solicitation from a renderer whose bootstrap finished after
 * the controller's load-time parent-ready (or whose document never received
 * one). Carries no FrameIdentity: the whole point is that the renderer does
 * not have one yet. The controller answers with ParentReadyMessage.
 */
export interface RendererHelloMessage extends FrameMessage {
  type: "renderer-hello";
}

export interface FrameIdentity {
  projectId: string;
  workspaceId: string;
  cardId: string;
}

export interface ParentReadyMessage extends FrameMessage {
  type: "parent-ready";
  projectId: string;
  workspaceId: string;
  cardId: string;
}

export interface RendererMessage extends FrameMessage, FrameIdentity {}

export interface FrameReadyMessage extends RendererMessage {
  type: "frame-ready";
  url: string;
  title: string;
}

export interface FrameMetadataMessage extends RendererMessage {
  type: "frame-metadata";
  url?: string;
  title?: string;
}

export interface FrameLoadError extends RendererMessage {
  type: "frame-error";
  message: string;
}

export interface ReplaceStylesMessage extends FrameMessage {
  type: "replace-styles";
  projectId: string;
  workspaceId: string;
  cardId: string;
  css: string;
  revision: number;
  /** Controller-owned durable targets; the renderer derives local markers. */
  instanceOverrides: import("../renderedInstance.ts").RenderedInstanceOverride[];
  /** Controller-owned structural intent; renderers never own this change log. */
  structuralChanges: import("../structuralProjection.ts").StructuralChange[];
  /** Controller-owned durable rendered text intent. */
  textContentChanges: import("../changes/types.ts").TextContentChangeRecord[];
  /** Controller-owned semantic component overrides for Canvas runtimes. */
  componentOverrides: ComponentOverride[];
}

/** Renderer acknowledgement that one complete controller snapshot is applied. */
export interface ProjectionAppliedMessage extends RendererMessage {
  type: "projection-applied";
  revision: number;
}

/**
 * Renderer-local outcomes for one controller snapshot. This is diagnostic
 * data only: accepting it never changes controller-owned structural intent.
 */
export interface StructuralProjectionReportMessage extends RendererMessage {
  type: "structural-projection-report";
  revision: number;
  reports: import("../structuralProjection.ts").StructuralProjectionReport[];
}

/** Renderer-local CSS-instance outcomes for one controller snapshot. */
export interface RenderedInstanceProjectionReportMessage extends RendererMessage {
  type: "rendered-instance-projection-report";
  revision: number;
  reports: import("../renderedInstance.ts").DocumentProjectionReport[];
}

/** Renderer-local outcomes for one controller-owned text snapshot. */
export interface TextProjectionReportMessage extends RendererMessage {
  type: "text-projection-report";
  revision: number;
  reports: import("../textProjection.ts").TextProjectionReport[];
}

export interface NavigationIntentMessage extends RendererMessage {
  type: "navigation-intent";
  url: string;
}

export interface ElementHoverMessage extends RendererMessage {
  type: "element-hover";
  cid: string;
  selector: string;
  src: string;
  elementId: string;
  rect: { left: number; top: number; width: number; height: number } | null;
  margins: { top: number; right: number; bottom: number; left: number } | null;
}

/** Modifier state stays inside one renderer frame; the parent never infers it
 * from its own keyboard events because focus lives in the iframe. */
export interface ElementMeasureStateMessage extends RendererMessage {
  type: "element-measure-state";
  altKey: boolean;
  pointerOverPage: boolean;
}

export interface ElementClickMessage extends RendererMessage {
  type: "element-click";
  cid: string;
  selector: string;
  src: string;
  elementId: string;
  file: string;
  line: number;
  component: string;
}

export interface ElementDragStartMessage extends RendererMessage {
  type: "element-drag-start";
  cid: string;
  src: string;
  elementId: string;
  point: { x: number; y: number };
}

export interface ElementDragMoveMessage extends RendererMessage {
  type: "element-drag-move";
  point: { x: number; y: number };
}

export interface ElementDragEndMessage extends RendererMessage {
  type: "element-drag-end";
  point: { x: number; y: number };
}

export interface ElementDeleteMessage extends RendererMessage {
  type: "element-delete";
  cid: string;
  src: string;
  elementId: string;
}

export interface ElementNudgeMessage extends RendererMessage {
  type: "element-nudge";
  cid: string;
  src: string;
  elementId: string;
  key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";
}

/** A renderer may request history navigation; only the parent changes history. */
export interface HistoryRequestMessage extends RendererMessage {
  type: "history-request";
  action: "undo" | "redo";
}

export interface ExternalNavigationMessage extends RendererMessage {
  type: "external-navigation";
  url: string;
}

export interface PanStartMessage extends RendererMessage {
  type: "pan-start";
  point: { x: number; y: number };
}

export interface PanMoveMessage extends RendererMessage {
  type: "pan-move";
  point: { x: number; y: number };
}

export interface PanEndMessage extends RendererMessage {
  type: "pan-end";
}

/** Keeps iframe pointer handling in sync when Space is held in the controller. */
export interface PanModifierMessage extends RendererMessage {
  type: "pan-modifier";
  spaceHeld: boolean;
}

/** Proxies modified wheel gestures that originate inside an iframe card. */
export interface ZoomMessage extends RendererMessage {
  type: "zoom";
  deltaY: number;
  point: { x: number; y: number };
}

export type FrameProtocolMessage =
  | ParentReadyMessage
  | RendererHelloMessage
  | FrameReadyMessage
  | FrameMetadataMessage
  | FrameLoadError
  | ReplaceStylesMessage
  | ProjectionAppliedMessage
  | StructuralProjectionReportMessage
  | RenderedInstanceProjectionReportMessage
  | TextProjectionReportMessage
  | NavigationIntentMessage
  | ElementHoverMessage
  | ElementMeasureStateMessage
  | ElementClickMessage
  | ElementDragStartMessage
  | ElementDragMoveMessage
  | ElementDragEndMessage
  | ElementDeleteMessage
  | ElementNudgeMessage
  | HistoryRequestMessage
  | ExternalNavigationMessage
  | PanStartMessage
  | PanMoveMessage
  | PanEndMessage
  | PanModifierMessage
  | ZoomMessage;

let rendererIdentity: FrameIdentity | null = null;

export function setRendererIdentity(identity: FrameIdentity): void {
  rendererIdentity = identity;
}

export function getRendererIdentity(): FrameIdentity | null {
  return rendererIdentity;
}

export function isRendererMessageFor(
  value: unknown,
  identity: FrameIdentity,
): value is RendererMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<RendererMessage>;
  return message.protocolVersion === PROTOCOL_VERSION
    && message.projectId === identity.projectId
    && message.workspaceId === identity.workspaceId
    && message.cardId === identity.cardId;
}

/** Strict JSON-only schema for renderer diagnostics before the parent records them. */
export function isStructuralProjectionReportMessage(
  value: unknown,
  identity: FrameIdentity,
): value is StructuralProjectionReportMessage {
  if (!isRendererMessageFor(value, identity) || !value || typeof value !== "object") return false;
  const message = value as unknown as Record<string, unknown>;
  if (!hasOnlyKeys(message, [
    "type", "protocolVersion", "projectId", "workspaceId", "cardId", "revision", "reports",
  ])) return false;
  return message.type === "structural-projection-report"
    && Number.isSafeInteger(message.revision)
    && (message.revision as number) >= 0
    && Array.isArray(message.reports)
    && message.reports.every(isStructuralProjectionReport);
}

/** Strict JSON-only schema for renderer CSS-instance diagnostics. */
export function isRenderedInstanceProjectionReportMessage(
  value: unknown,
  identity: FrameIdentity,
): value is RenderedInstanceProjectionReportMessage {
  if (!isRendererMessageFor(value, identity) || !value || typeof value !== "object") return false;
  const message = value as unknown as Record<string, unknown>;
  if (!hasOnlyKeys(message, [
    "type", "protocolVersion", "projectId", "workspaceId", "cardId", "revision", "reports",
  ])) return false;
  return message.type === "rendered-instance-projection-report"
    && Number.isSafeInteger(message.revision)
    && (message.revision as number) >= 0
    && Array.isArray(message.reports)
    && message.reports.every(isDocumentProjectionReport);
}

/** Strict JSON-only schema for renderer rendered-text diagnostics. */
export function isTextProjectionReportMessage(
  value: unknown,
  identity: FrameIdentity,
): value is TextProjectionReportMessage {
  if (!isRendererMessageFor(value, identity) || !isProtocolObject(value)) return false;
  if (!hasOnlyKeys(value, [
    "type", "protocolVersion", "projectId", "workspaceId", "cardId", "revision", "reports",
  ])) return false;
  const type = ownValue(value, "type");
  const revision = ownValue(value, "revision");
  const reports = ownValue(value, "reports");
  return type === "text-projection-report"
    && typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0
    && Array.isArray(reports)
    && reports.every(isTextProjectionReport);
}

/** Strict JSON-only acknowledgement for a fully applied Canvas snapshot. */
export function isProjectionAppliedMessage(
  value: unknown,
  identity: FrameIdentity,
): value is ProjectionAppliedMessage {
  if (!isRendererMessageFor(value, identity) || !isProtocolObject(value)) return false;
  if (!hasOnlyKeys(value, [
    "type", "protocolVersion", "projectId", "workspaceId", "cardId", "revision",
  ])) return false;
  const type = ownValue(value, "type");
  const revision = ownValue(value, "revision");
  return type === "projection-applied"
    && typeof revision === "number"
    && Number.isSafeInteger(revision)
    && revision >= 0;
}

export function isComponentOverrideList(value: unknown): value is ComponentOverride[] {
  if (!Array.isArray(value)) return false;
  return value.every((candidate) => {
    if (!isProtocolObject(candidate)
      || !hasOnlyKeys(candidate, ["framework", "callsiteId", "prop", "value"])) return false;
    const framework = ownValue(candidate, "framework");
    const callsiteId = ownValue(candidate, "callsiteId");
    const prop = ownValue(candidate, "prop");
    const overrideValue = ownValue(candidate, "value");
    return framework === "react"
      && typeof callsiteId === "string" && callsiteId.length > 0
      && typeof prop === "string" && prop.length > 0
      && (typeof overrideValue === "string"
        || typeof overrideValue === "number" && Number.isFinite(overrideValue)
        || typeof overrideValue === "boolean");
  });
}

/** Raw JSON object at the renderer postMessage boundary. */
interface ProtocolObject {
  readonly cardId?: unknown;
  readonly callsiteId?: unknown;
  readonly framework?: unknown;
  readonly prop?: unknown;
  readonly projectId?: unknown;
  readonly protocolVersion?: unknown;
  readonly reports?: unknown;
  readonly revision?: unknown;
  readonly type?: unknown;
  readonly value?: unknown;
  readonly workspaceId?: unknown;
}

type ProtocolObjectKey = keyof ProtocolObject;

function isProtocolObject(value: unknown): value is ProtocolObject {
  return typeof value === "object" && value !== null;
}

function ownValue(value: ProtocolObject, key: ProtocolObjectKey): unknown {
  switch (key) {
    case "cardId": return value.cardId;
    case "callsiteId": return value.callsiteId;
    case "framework": return value.framework;
    case "prop": return value.prop;
    case "projectId": return value.projectId;
    case "protocolVersion": return value.protocolVersion;
    case "reports": return value.reports;
    case "revision": return value.revision;
    case "type": return value.type;
    case "value": return value.value;
    case "workspaceId": return value.workspaceId;
  }
}

function hasOnlyKeys(value: ProtocolObject, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function sendToParent(msg: FrameProtocolMessage): void {
  window.parent.postMessage(msg, window.location.origin);
}
