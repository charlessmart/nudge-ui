import { useEffect, useState, type CSSProperties, type ReactElement } from "react";
import {
  isRendererMessageFor,
  type ElementClickMessage,
  type ElementHoverMessage,
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

interface FrameOverlayState {
  iframe: HTMLIFrameElement;
  rect: Rect;
  margins: Margins;
  cardId: string;
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

export function CanvasElementOverlay(): ReactElement | null {
  const [hover, setHover] = useState<FrameOverlayState | null>(null);
  const selected = useSelectedElement();
  const camera = useBoardCamera();
  useCanvasCards(); // Projected geometry must follow card drag and resize updates.

  const selectedFrame = selected?.domElement.ownerDocument.defaultView?.frameElement;
  const selectedInCanvas = selectedFrame instanceof HTMLIFrameElement
    && selectedFrame.hasAttribute("data-design-tool-canvas-renderer");
  const selectedRect = selectedInCanvas && selected
    ? projectRect(selectedFrame, toRect(selected.domElement.getBoundingClientRect()), camera.zoom)
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
          rect: msg.rect,
          margins: msg.margins ?? { top: 0, right: 0, bottom: 0, left: 0 },
          cardId: sourceCardId,
        });
      } else if (event.data.type === "element-click") {
        const msg = event.data as ElementClickMessage;
        if (!msg.cid) return;
        handleElementClick(msg, sourceIframe, sourceCardId);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!hover && !selectedRect) return null;

  const projectedHoverRect = hover ? projectRect(hover.iframe, hover.rect, camera.zoom) : null;
  const hoverMargins = hover ? scaleMargins(hover.margins, camera.zoom) : null;
  const hoverMarginGuides = projectedHoverRect && hoverMargins
    ? getMarginGuides(projectedHoverRect, hoverMargins)
    : [];
  const hoverMarginFills = projectedHoverRect && hoverMargins
    ? getMarginFills(projectedHoverRect, hoverMargins)
    : [];

  return (
    <>
      <style data-test="canvas-element-overlay-styles">{overlayStyles}</style>
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
    </>
  );
}
