import { isDocumentProjectionReport } from "../renderedInstance.ts";

// v8 adds controller/renderer gesture messages for iframe canvas cards.
export const PROTOCOL_VERSION = 8;

export interface FrameMessage {
  type: string;
  protocolVersion: number;
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
  | FrameReadyMessage
  | FrameMetadataMessage
  | FrameLoadError
  | ReplaceStylesMessage
  | StructuralProjectionReportMessage
  | RenderedInstanceProjectionReportMessage
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

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isStructuralProjectionReport(value: unknown): value is import("../structuralProjection.ts").StructuralProjectionReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Record<string, unknown>;
  return hasOnlyKeys(report, ["changeId", "status"])
    && typeof report.changeId === "string"
    && (report.status === "applied" || report.status === "missing"
      || report.status === "ambiguous" || report.status === "overridden");
}

export function sendToParent(msg: FrameProtocolMessage): void {
  window.parent.postMessage(msg, window.location.origin);
}
