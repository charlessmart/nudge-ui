export const PROTOCOL_VERSION = 1;

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
  instanceIndex: number;
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
  instanceIndex: number;
  file: string;
  line: number;
  component: string;
}

export interface ElementDragStartMessage extends RendererMessage {
  type: "element-drag-start";
  cid: string;
  src: string;
  instanceIndex: number;
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
  instanceIndex: number;
}

export interface ElementNudgeMessage extends RendererMessage {
  type: "element-nudge";
  cid: string;
  src: string;
  instanceIndex: number;
  key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";
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

export type FrameProtocolMessage =
  | ParentReadyMessage
  | FrameReadyMessage
  | FrameMetadataMessage
  | FrameLoadError
  | ReplaceStylesMessage
  | NavigationIntentMessage
  | ElementHoverMessage
  | ElementMeasureStateMessage
  | ElementClickMessage
  | ElementDragStartMessage
  | ElementDragMoveMessage
  | ElementDragEndMessage
  | ElementDeleteMessage
  | ElementNudgeMessage
  | ExternalNavigationMessage
  | PanStartMessage
  | PanMoveMessage
  | PanEndMessage;

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

export function sendToParent(msg: FrameProtocolMessage): void {
  window.parent.postMessage(msg, window.location.origin);
}
