import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import {
  isRendererMessageFor,
  type ElementClickMessage,
  type ElementHoverMessage,
  type ElementDeleteMessage,
  type ElementNudgeMessage,
  type ElementDragEndMessage,
  type ElementDragMoveMessage,
  type ElementDragStartMessage,
} from "./frameProtocol.ts";
import { findCanvasFrameBySource, PROJECT_ID, WORKSPACE_ID } from "./projection.ts";
import { getBoardCamera } from "./canvasStore.ts";
import { handleElementClick } from "./rendererSelectionProxy.ts";
import overlayStyles from "./CanvasElementOverlay.css?inline";
import { deleteElement, getDropLocationAtPoint, moveElement, nudgeElement } from "../domMutations.ts";
import { resolveSelectionFromElement } from "../resolveSelection.ts";
import { setSelectedElement } from "../selectionStore.ts";
import { clearDropGuide, showDropGuide, useDropGuide, type DropGuide } from "../dropGuide.ts";
import { DropGuideOverlay, type ViewportDropGuide } from "../DropGuideOverlay.tsx";

interface HoverState {
  left: number;
  top: number;
  width: number;
  height: number;
  cardId: string;
}

interface CanvasDragState {
  iframe: HTMLIFrameElement;
  element: HTMLElement;
}

function findFrameElement(iframe: HTMLIFrameElement, cid: string, src: string, instanceIndex: number): HTMLElement | null {
  const doc = iframe.contentDocument;
  if (!doc) return null;
  const matches = Array.from(doc.querySelectorAll<HTMLElement>("[data-cid]")).filter((candidate) => (
    candidate.getAttribute("data-cid") === cid && candidate.getAttribute("data-src") === src
  ));
  return matches[instanceIndex] ?? null;
}

function projectGuideToCanvas(guide: DropGuide | null): ViewportDropGuide | null {
  if (!guide) return null;
  const iframe = guide.document.defaultView?.frameElement;
  if (!(iframe instanceof HTMLIFrameElement)) return null;
  const iframeRect = iframe.getBoundingClientRect();
  const zoom = getBoardCamera().zoom;
  const project = (rect: DropGuide["line"], scaleWidth: boolean, scaleHeight: boolean): DropGuide["line"] => ({
    left: iframeRect.left + rect.left * zoom,
    top: iframeRect.top + rect.top * zoom,
    width: scaleWidth ? rect.width * zoom : rect.width,
    height: scaleHeight ? rect.height * zoom : rect.height,
  });
  return {
    orientation: guide.orientation,
    line: project(guide.line, guide.orientation === "horizontal", guide.orientation === "vertical"),
    target: project(guide.target, true, true),
  };
}

export function CanvasElementOverlay(): ReactElement | null {
  const [hover, setHover] = useState<HoverState | null>(null);
  const dragRef = useRef<CanvasDragState | null>(null);
  const dropGuide = useDropGuide("canvas");
  const projectedDropGuide = projectGuideToCanvas(dropGuide);

  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      if (event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data !== "object") return;
      const sourceFrame = findCanvasFrameBySource(event.source);
      if (!sourceFrame) return;
      const { cardId: sourceCardId, iframe: sourceIframe } = sourceFrame;
      if (!isRendererMessageFor(event.data, {
        projectId: PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        cardId: sourceCardId,
      })) return;

      if (event.data.type === "element-hover") {
        const msg = event.data as ElementHoverMessage;
        if (!msg.cid) return;

        if (msg.rect === null) {
          setHover((current) => {
            if (current && current.cardId === sourceCardId) return null;
            return current;
          });
          return;
        }

        const iframeRect = sourceIframe.getBoundingClientRect();
        const zoom = getBoardCamera().zoom;
        setHover({
          left: iframeRect.left + msg.rect.left * zoom,
          top: iframeRect.top + msg.rect.top * zoom,
          width: msg.rect.width * zoom,
          height: msg.rect.height * zoom,
          cardId: sourceCardId,
        });
      } else if (event.data.type === "element-click") {
        const msg = event.data as ElementClickMessage;
        if (!msg.cid) return;
        handleElementClick(msg, sourceIframe, sourceCardId);
      } else if (event.data.type === "element-drag-start") {
        const msg = event.data as ElementDragStartMessage;
        const element = findFrameElement(sourceIframe, msg.cid, msg.src, msg.instanceIndex);
        if (!element) return;
        dragRef.current = { iframe: sourceIframe, element };
        const selected = resolveSelectionFromElement(element);
        if (selected) setSelectedElement(selected);
        updateDropGuide(msg.point, sourceIframe);
      } else if (event.data.type === "element-drag-move") {
        updateDropGuide((event.data as ElementDragMoveMessage).point, sourceIframe);
      } else if (event.data.type === "element-drag-end") {
        const msg = event.data as ElementDragEndMessage;
        const current = dragRef.current;
        if (current && current.iframe === sourceIframe) {
          const drop = getDropLocationAtPoint(sourceIframe.contentDocument!, current.element, msg.point.x, msg.point.y);
          if (drop) moveElement(current.element, drop);
          const selected = resolveSelectionFromElement(current.element);
          if (selected) setSelectedElement(selected);
        }
        dragRef.current = null;
        clearDropGuide("canvas");
      } else if (event.data.type === "element-delete") {
        const msg = event.data as ElementDeleteMessage;
        const element = findFrameElement(sourceIframe, msg.cid, msg.src, msg.instanceIndex);
        const selected = element ? resolveSelectionFromElement(element) : null;
        if (selected && deleteElement(selected)) setSelectedElement(null);
      } else if (event.data.type === "element-nudge") {
        const msg = event.data as ElementNudgeMessage;
        const element = findFrameElement(sourceIframe, msg.cid, msg.src, msg.instanceIndex);
        const record = element ? nudgeElement(element, msg.key) : null;
        if (element && record) {
          const selected = resolveSelectionFromElement(element);
          if (selected) setSelectedElement(selected);
        }
      }

      function updateDropGuide(point: { x: number; y: number }, iframe: HTMLIFrameElement): void {
        const current = dragRef.current;
        if (!current || current.iframe !== iframe || !iframe.contentDocument) return;
        const drop = getDropLocationAtPoint(iframe.contentDocument, current.element, point.x, point.y);
        if (!drop) {
          clearDropGuide("canvas");
          return;
        }
        showDropGuide("canvas", iframe.contentDocument, drop);
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      clearDropGuide("canvas");
    };
  }, []);

  if (!hover && !projectedDropGuide) return null;

  const style: CSSProperties = hover ? {
    position: "fixed",
    left: hover.left,
    top: hover.top,
    width: hover.width,
    height: hover.height,
    pointerEvents: "none",
    zIndex: 3,
  } : {};

  return (
    <>
      <style data-test="canvas-element-overlay-styles">{overlayStyles}</style>
      {hover ? <div className="dt-canvas-element-overlay" style={style} aria-hidden="true" /> : null}
      <DropGuideOverlay
        guide={projectedDropGuide}
        lineClassName="dt-canvas-dom-drop-line"
        lineTestId="canvas-dom-drop-line"
        targetClassName="dt-canvas-dom-drop-target"
        targetTestId="canvas-dom-drop-target"
      />
    </>
  );
}
