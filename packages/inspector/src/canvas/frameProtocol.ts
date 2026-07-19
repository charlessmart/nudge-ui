export const PROTOCOL_VERSION = 1;

export interface FrameMessage {
  type: string;
  protocolVersion: number;
}

export interface ParentReadyMessage extends FrameMessage {
  type: "parent-ready";
  projectId: string;
  workspaceId: string;
  cardId: string;
}

export interface FrameReadyMessage extends FrameMessage {
  type: "frame-ready";
  url: string;
  title: string;
}

export interface FrameMetadataMessage extends FrameMessage {
  type: "frame-metadata";
  url?: string;
  title?: string;
}

export interface FrameLoadError extends FrameMessage {
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

export interface NavigationIntentMessage extends FrameMessage {
  type: "navigation-intent";
  url: string;
}

export interface ElementHoverMessage extends FrameMessage {
  type: "element-hover";
  cid: string;
  selector: string;
  rect: { left: number; top: number; width: number; height: number } | null;
}

export interface ElementClickMessage extends FrameMessage {
  type: "element-click";
  cid: string;
  selector: string;
  file: string;
  line: number;
  component: string;
}

export type FrameProtocolMessage =
  | ParentReadyMessage
  | FrameReadyMessage
  | FrameMetadataMessage
  | FrameLoadError
  | ReplaceStylesMessage
  | NavigationIntentMessage
  | ElementHoverMessage
  | ElementClickMessage;

export function sendToParent(msg: FrameProtocolMessage): void {
  window.parent.postMessage(msg, window.location.origin);
}
