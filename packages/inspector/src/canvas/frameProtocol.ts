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

export type FrameProtocolMessage =
  | ParentReadyMessage
  | FrameReadyMessage
  | FrameMetadataMessage
  | FrameLoadError
  | ReplaceStylesMessage;

export function sendToParent(msg: FrameProtocolMessage): void {
  window.parent.postMessage(msg, window.location.origin);
}
