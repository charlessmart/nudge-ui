import {
  isRendererMessageFor,
  isRendererMessageType,
  PROTOCOL_VERSION,
  type RendererToControllerMessage,
} from "./frameProtocol.ts";
import { connectFrame, type FrameConnection } from "./frameConnection.ts";
import { findCanvasFrameBySource } from "./projection.ts";

export interface CanvasRendererMessage {
  frame: FrameConnection;
  message: RendererToControllerMessage;
}

type CanvasRendererMessageListener = (event: CanvasRendererMessage) => void;

const listeners = new Set<CanvasRendererMessageListener>();

function routeRendererMessage(event: MessageEvent): void {
  if (event.origin !== window.location.origin || !event.data || typeof event.data !== "object") return;
  const source = findCanvasFrameBySource(event.source);
  if (!source) return;
  const frame = connectFrame(source.cardId, source.iframe);
  // SAFETY: The object guard above makes the optional discriminator fields safe to inspect.
  const candidate = event.data as { type?: unknown; protocolVersion?: unknown };
  if (!isRendererMessageType(candidate.type)) return;
  if (candidate.type === "renderer-hello") {
    if (candidate.protocolVersion !== PROTOCOL_VERSION) return;
  } else if (!isRendererMessageFor(event.data, frame.identity)) {
    return;
  }

  // SAFETY: The type is a known renderer message; subscribers narrow it and
  // apply the strict per-message schema before trusting message-specific fields.
  const routed = { frame, message: event.data as RendererToControllerMessage };
  for (const listener of listeners) listener(routed);
}

export function subscribeCanvasRendererMessages(listener: CanvasRendererMessageListener): () => void {
  if (listeners.size === 0) window.addEventListener("message", routeRendererMessage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("message", routeRendererMessage);
  };
}
