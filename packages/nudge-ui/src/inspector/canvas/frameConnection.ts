import type { CanvasFrame } from "./canvasFrame.ts";
import type { Rect } from "../overlay/overlayGeometry.ts";
import {
  PROTOCOL_VERSION,
  type ControllerToRendererMessage,
  type FrameIdentity,
} from "./frameProtocol.ts";
import { RENDERER_ELEMENT_ID_ATTR } from "./rendererCidIndex.ts";

export const PROJECT_ID = typeof window !== "undefined" && window.location?.origin
  ? window.location.origin
  : "";

export const WORKSPACE_ID = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
  ? crypto.randomUUID()
  : `ws-${Date.now()}`;

export interface FramePoint {
  readonly x: number;
  readonly y: number;
}

/** Measured, not read from the camera: correct on the board, in focus view, and mid-transition. */
export interface FrameViewport extends Readonly<Rect> {
  readonly scale: number;
}

export interface RendererElementRef {
  readonly elementId: string;
  readonly cid: string;
  readonly src: string;
}

type Envelope = "protocolVersion" | "projectId" | "workspaceId" | "cardId";
type WithoutEnvelope<T> = T extends unknown ? Omit<T, Envelope> : never;
export type ControllerMessageBody = WithoutEnvelope<ControllerToRendererMessage>;

export interface FrameConnection {
  readonly cardId: string;
  readonly iframe: CanvasFrame;
  readonly identity: FrameIdentity;
  /** The renderer's document; null while the frame navigates or blocks access. */
  document(): Document | null;
  /** Null unless exactly one element carries the renderer ID and its source identity still matches. */
  element(ref: RendererElementRef): HTMLElement | null;
  viewport(): FrameViewport;
  post(message: ControllerMessageBody): void;
}

const RENDERER_ELEMENT_ID = /^r\d+$/;
const connections = new WeakMap<CanvasFrame, FrameConnection>();

export function measureFrameViewport(iframe: CanvasFrame): FrameViewport {
  const rect = iframe.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    scale: iframe.clientWidth > 0 ? rect.width / iframe.clientWidth : 1,
  };
}

export function toViewportPoint(viewport: FrameViewport, point: FramePoint): FramePoint {
  return {
    x: viewport.left + point.x * viewport.scale,
    y: viewport.top + point.y * viewport.scale,
  };
}

/** Pass `false` for an axis whose size is a guide thickness in controller pixels. */
export function toViewportRect(
  viewport: FrameViewport,
  rect: Rect,
  scaleSize: { readonly width: boolean; readonly height: boolean } = { width: true, height: true },
): Rect {
  return {
    left: viewport.left + rect.left * viewport.scale,
    top: viewport.top + rect.top * viewport.scale,
    width: scaleSize.width ? rect.width * viewport.scale : rect.width,
    height: scaleSize.height ? rect.height * viewport.scale : rect.height,
  };
}

export function findRendererElement(doc: Document | null, ref: RendererElementRef): HTMLElement | null {
  if (!doc || !RENDERER_ELEMENT_ID.test(ref.elementId)) return null;
  const candidates = doc.querySelectorAll(`[${RENDERER_ELEMENT_ID_ATTR}="${ref.elementId}"]`);
  const candidate = candidates.length === 1 ? candidates[0] : null;
  if (!candidate
    || candidate.getAttribute("data-cid") !== ref.cid
    || (candidate.getAttribute("data-src") ?? "") !== ref.src) return null;
  const frameWindow = doc.defaultView;
  if (!frameWindow) return null;
  const SVGElementConstructor = frameWindow.SVGElement;
  const supported = candidate instanceof frameWindow.HTMLElement
    || (SVGElementConstructor !== undefined && candidate instanceof SVGElementConstructor);
  // SAFETY: SVG roots share the selection surface's element APIs.
  return supported ? candidate as HTMLElement : null;
}

export function connectFrame(cardId: string, iframe: CanvasFrame): FrameConnection {
  const existing = connections.get(iframe);
  if (existing?.cardId === cardId) return existing;
  const identity: FrameIdentity = { projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, cardId };
  const connection: FrameConnection = {
    cardId,
    iframe,
    identity,
    document() {
      try {
        return iframe.contentDocument;
      } catch {
        return null;
      }
    },
    element: (ref) => findRendererElement(connection.document(), ref),
    viewport: () => measureFrameViewport(iframe),
    post(message) {
      iframe.contentWindow?.postMessage(
        { ...message, protocolVersion: PROTOCOL_VERSION, ...identity },
        window.location.origin,
      );
    },
  };
  connections.set(iframe, connection);
  return connection;
}
