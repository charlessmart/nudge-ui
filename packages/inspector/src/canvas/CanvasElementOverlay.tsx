import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import {
  isRendererMessageFor,
  type ElementClickMessage,
  type ElementHoverMessage,
  type ElementMeasureStateMessage,
  type ElementDeleteMessage,
  type ElementNudgeMessage,
  type ElementDragEndMessage,
  type ElementDragMoveMessage,
  type ElementDragStartMessage,
} from "./frameProtocol.ts";
import { findCanvasFrameBySource, PROJECT_ID, WORKSPACE_ID } from "./projection.ts";
import { useBoardCamera, useCanvasCards } from "./canvasStore.ts";
import { handleElementClick } from "./rendererSelectionProxy.ts";
import { useSelectedElement } from "../selectionStore.ts";
import {
  getMarginFills,
  getMarginGuides,
  toRect,
  type Margins,
  type Rect,
} from "../overlayGeometry.ts";
import overlayStyles from "./CanvasElementOverlay.css?inline";
import { deleteElement, getDropLocationAtPoint, moveElement, nudgeElement } from "../domMutations.ts";
import { resolveSelectionFromElement } from "../resolveSelection.ts";
import { setSelectedElement } from "../selectionStore.ts";
import { clearDropGuide, showDropGuide, useDropGuide, type DropGuide } from "../dropGuide.ts";
import { DropGuideOverlay, type ViewportDropGuide } from "../DropGuideOverlay.tsx";
import { getMeasurementGeometry } from "../measurementGeometry.ts";
import { MeasurementGuideOverlay } from "../MeasurementGuideOverlay.tsx";
import { projectMeasurementSegments } from "./measurementProjection.ts";

interface FrameOverlayState {
  iframe: HTMLIFrameElement;
  element: HTMLElement | null;
  rect: Rect;
  margins: Margins;
  cardId: string;
}

interface FrameMeasureState {
  iframe: HTMLIFrameElement;
  altKey: boolean;
  pointerOverPage: boolean;
}

interface CanvasDragState {
  iframe: HTMLIFrameElement;
  element: HTMLElement;
}

function projectRect(iframe: HTMLIFrameElement, rect: Rect, zoom: number): Rect {
  const frameRect = iframe.getBoundingClientRect();
  return {
    left: frameRect.left + rect.left * zoom,
    top: frameRect.top + rect.top * zoom,
    width: rect.width * zoom,
    height: rect.height * zoom,
  };
}

function scaleMargins(margins: Margins, zoom: number): Margins {
  return {
    top: margins.top * zoom,
    right: margins.right * zoom,
    bottom: margins.bottom * zoom,
    left: margins.left * zoom,
  };
}

function overlayStyle(rect: Rect): CSSProperties {
  return {
    position: "fixed",
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    pointerEvents: "none",
  };
}

function findFrameElement(iframe: HTMLIFrameElement, cid: string, src: string, instanceIndex: number): HTMLElement | null {
  const doc = iframe.contentDocument;
  if (!doc) return null;
  const matches = Array.from(doc.querySelectorAll<HTMLElement>("[data-cid]")).filter((candidate) => (
    candidate.getAttribute("data-cid") === cid && candidate.getAttribute("data-src") === src
  ));
  return matches[instanceIndex] ?? null;
}

function projectGuideToCanvas(guide: DropGuide | null, zoom: number): ViewportDropGuide | null {
  if (!guide) return null;
  const iframe = guide.document.defaultView?.frameElement;
  if (!(iframe instanceof HTMLIFrameElement)) return null;
  const iframeRect = iframe.getBoundingClientRect();
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
  const [hover, setHover] = useState<FrameOverlayState | null>(null);
  const [measureState, setMeasureState] = useState<FrameMeasureState | null>(null);
  const selected = useSelectedElement();
  const camera = useBoardCamera();
  useCanvasCards(); // Projected geometry must follow card drag and resize updates.
  const dragRef = useRef<CanvasDragState | null>(null);
  const dropGuide = useDropGuide("canvas");
  const projectedDropGuide = projectGuideToCanvas(dropGuide, camera.zoom);

  const selectedFrame = selected?.domElement.ownerDocument.defaultView?.frameElement;
  const selectedInCanvas = selectedFrame instanceof HTMLIFrameElement
    && selectedFrame.hasAttribute("data-design-tool-canvas-renderer");
  const selectedLocalRect = selectedInCanvas && selected
    ? toRect(selected.domElement.getBoundingClientRect())
    : null;
  const selectedFrameRect = selectedInCanvas
    ? toRect(selectedFrame.getBoundingClientRect())
    : null;
  const selectedRect = selectedInCanvas && selectedLocalRect
    ? projectRect(selectedFrame, selectedLocalRect, camera.zoom)
    : null;

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
          setHover((current) => current?.cardId === sourceCardId ? null : current);
          return;
        }
        setHover({
          iframe: sourceIframe,
          element: findFrameElement(sourceIframe, msg.cid, msg.src, msg.instanceIndex),
          rect: msg.rect,
          margins: msg.margins ?? { top: 0, right: 0, bottom: 0, left: 0 },
          cardId: sourceCardId,
        });
      } else if (event.data.type === "element-measure-state") {
        const msg = event.data as ElementMeasureStateMessage;
        setMeasureState({
          iframe: sourceIframe,
          altKey: msg.altKey,
          pointerOverPage: msg.pointerOverPage,
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
        const selectedElement = resolveSelectionFromElement(element);
        if (selectedElement) setSelectedElement(selectedElement);
        updateDropGuide(msg.point, sourceIframe);
      } else if (event.data.type === "element-drag-move") {
        updateDropGuide((event.data as ElementDragMoveMessage).point, sourceIframe);
      } else if (event.data.type === "element-drag-end") {
        const msg = event.data as ElementDragEndMessage;
        const current = dragRef.current;
        if (current && current.iframe === sourceIframe && sourceIframe.contentDocument) {
          const drop = getDropLocationAtPoint(sourceIframe.contentDocument, current.element, msg.point.x, msg.point.y);
          if (drop) moveElement(current.element, drop);
          const selectedElement = resolveSelectionFromElement(current.element);
          if (selectedElement) setSelectedElement(selectedElement);
        }
        dragRef.current = null;
        clearDropGuide("canvas");
      } else if (event.data.type === "element-delete") {
        const msg = event.data as ElementDeleteMessage;
        const element = findFrameElement(sourceIframe, msg.cid, msg.src, msg.instanceIndex);
        const selectedElement = element ? resolveSelectionFromElement(element) : null;
        if (selectedElement && deleteElement(selectedElement)) setSelectedElement(null);
      } else if (event.data.type === "element-nudge") {
        const msg = event.data as ElementNudgeMessage;
        const element = findFrameElement(sourceIframe, msg.cid, msg.src, msg.instanceIndex);
        const record = element ? nudgeElement(element, msg.key) : null;
        if (element && record) {
          const selectedElement = resolveSelectionFromElement(element);
          if (selectedElement) setSelectedElement(selectedElement);
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

  if (!hover && !selectedRect && !projectedDropGuide) return null;

  const projectedHoverRect = hover ? projectRect(hover.iframe, hover.rect, camera.zoom) : null;
  const hoverMargins = hover ? scaleMargins(hover.margins, camera.zoom) : null;
  const hoverMarginGuides = projectedHoverRect && hoverMargins
    ? getMarginGuides(projectedHoverRect, hoverMargins)
    : [];
  const hoverMarginFills = projectedHoverRect && hoverMargins
    ? getMarginFills(projectedHoverRect, hoverMargins)
    : [];
  const measureStateForSelectedFrame = measureState?.iframe === selectedFrame ? measureState : null;
  const hoverInSelectedFrame = hover?.iframe === selectedFrame ? hover : null;
  const showGuideOverlay = Boolean(
    selectedRect
    && selectedFrameRect
    && measureStateForSelectedFrame?.altKey
    && measureStateForSelectedFrame.pointerOverPage,
  );
  const showMeasurement = Boolean(
    showGuideOverlay
    && selectedLocalRect
    && hoverInSelectedFrame?.element
    && hoverInSelectedFrame.element !== selected?.domElement,
  );
  const measurementSegments = showMeasurement && selectedFrameRect && selectedLocalRect && hoverInSelectedFrame
    ? projectMeasurementSegments(
      selectedFrameRect,
      getMeasurementGeometry(selectedLocalRect, hoverInSelectedFrame.rect).segments,
      camera.zoom,
    )
    : [];

  return (
    <>
      <style data-test="canvas-element-overlay-styles">{overlayStyles}</style>
      {showGuideOverlay && selectedRect && selectedFrameRect ? (
        <MeasurementGuideOverlay
          testId="canvas-measurement-overlay"
          selectedRect={selectedRect}
          guideViewport={selectedFrameRect}
          segments={measurementSegments}
        />
      ) : null}
      {projectedHoverRect ? (
        <>
          {hoverMarginFills.map((fill) => (
            <div key={fill.side} className="dt-canvas-hover-margin-fill" data-side={fill.side} style={overlayStyle(fill)} aria-hidden="true" />
          ))}
          <div className="dt-canvas-element-overlay" data-test="canvas-hover-outline" style={overlayStyle(projectedHoverRect)} aria-hidden="true" />
          {hoverMarginGuides.map((guide) => (
            <div key={guide.side} className="dt-canvas-hover-margin" data-axis={guide.axis} data-distance={guide.distance} data-side={guide.side} style={overlayStyle(guide)} aria-hidden="true" />
          ))}
        </>
      ) : null}
      {selectedRect ? <div className="dt-canvas-selected-outline" data-test="canvas-selected-outline" style={overlayStyle(selectedRect)} aria-hidden="true" /> : null}
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
