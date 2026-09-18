import {
  isRendererMessageFor,
  PROTOCOL_VERSION,
  type FrameIdentity,
  type FrameProtocolMessage,
} from "./frameProtocol.ts";
import { findCanvasFrameBySource, PROJECT_ID, WORKSPACE_ID } from "./projection.ts";

export interface CanvasRendererMessage {
  cardId: string;
  iframe: HTMLIFrameElement;
  identity: FrameIdentity;
  message: FrameProtocolMessage;
}

type CanvasRendererMessageListener = (event: CanvasRendererMessage) => void;

const listeners = new Set<CanvasRendererMessageListener>();

function routeRendererMessage(event: MessageEvent): void {
  if (event.origin !== window.location.origin || !event.data || typeof event.data !== "object") return;
  const frame = findCanvasFrameBySource(event.source);
  if (!frame) return;
  const identity = {
    projectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    cardId: frame.cardId,
  };
  // SAFETY: The object guard above makes the optional discriminator fields safe to inspect.
  const candidate = event.data as { type?: string; protocolVersion?: number };
  if (candidate.type === "renderer-hello") {
    if (candidate.protocolVersion !== PROTOCOL_VERSION) return;
  } else if (!isRendererMessageFor(event.data, identity)) {
    return;
  }

  const routed = {
    ...frame,
    identity,
    // SAFETY: Subscribers narrow the discriminated protocol union before reading message-specific fields.
    message: event.data as FrameProtocolMessage,
  };
  for (const listener of listeners) listener(routed);
}

/** Subscribes to same-origin messages from registered Canvas renderer frames. */
export function subscribeCanvasRendererMessages(listener: CanvasRendererMessageListener): () => void {
  if (listeners.size === 0) window.addEventListener("message", routeRendererMessage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("message", routeRendererMessage);
  };
}
