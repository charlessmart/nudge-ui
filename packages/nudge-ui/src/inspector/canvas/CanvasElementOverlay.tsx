import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type ReactElement } from "react";
import {
  PROTOCOL_VERSION,
  isElementClickMessage,
  isInlineTextIntentMessage,
} from "./frameProtocol.ts";
import { useBoardCamera, useCanvasCards, useCanvasPresentation, useCanvasPresentationTransitioning } from "./canvasStore.ts";
import { handleElementClick } from "./rendererSelectionProxy.ts";
import { getSelectedElements, useSelectedElement, useSelectedElements } from "../selection/selectionStore.ts";
import {
  getMarginFills,
  getMarginGuides,
  readBorderWidths,
  toRect,
  type BorderWidths,
  type Margins,
  type Rect,
} from "../overlay/overlayGeometry.ts";
import overlayStyles from "./CanvasElementOverlay.css?inline";
import { deleteElement, getDropLocationAtPoint, moveElement, nudgeElement } from "../overlay/structuralGestures.ts";
import { redo, undo } from "../changes/changesLog.ts";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
import { setSelectedElement } from "../selection/selectionStore.ts";
import { clearDropGuide, showDropGuide, useDropGuide, type DropGuide } from "../overlay/dropGuide.ts";
import { DropGuideOverlay, type ViewportDropGuide } from "../overlay/DropGuideOverlay.tsx";
import { getMeasurementGeometry } from "../overlay/measurementGeometry.ts";
import { MeasurementGuideOverlay } from "../overlay/MeasurementGuideOverlay.tsx";
import { projectMeasurementSegments } from "./measurementProjection.ts";
import { getRegisteredFrames, PROJECT_ID, WORKSPACE_ID } from "./projection.ts";
import { RENDERER_ELEMENT_ID_ATTR } from "./rendererCidIndex.ts";
import { observeSelectedGeometry } from "../overlay/selectedGeometry.ts";
import { handleInlineTextEditIntent, useInlineTextSession } from "../inline-text/inlineTextEditor.ts";
import { setInspectorOpen, toggleInspector, useInspectorOpen } from "../shell/openStore.ts";
import { EMPTY_TEXT_PROJECTION_ATTR } from "../projection/textProjection.ts";
import { subscribeCanvasRendererMessages } from "./rendererMessageRouter.ts";
import { setStyle } from "../tokens/editActions.ts";
import {
  getSpacingAffordanceAtPoint,
  getSpacingAffordanceForDescriptor,
  spacingValueCss,
  spacingValueForDrag,
  type SpacingAffordance,
  type SpacingDescriptor,
} from "../overlay/spacingGestures.ts";

interface ElementIdentity {
  elementId: string;
}

interface FrameOverlayState {
  iframe: HTMLIFrameElement;
  identity: ElementIdentity;
  rect: Rect;
  margins: Margins;
  borders: BorderWidths;
  cardId: string;
  point: { x: number; y: number } | null;
  spacing: SpacingDescriptor | null;
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

interface CanvasSpacingDragState {
  iframe: HTMLIFrameElement;
  element: HTMLElement;
  affordance: SpacingAffordance;
  start: { x: number; y: number };
  startValue: number;
  currentValue: number;
  originalInlineValue: string;
  originalInlinePriority: string;
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

function findFrameElement(iframe: HTMLIFrameElement, elementId: string, cid: string, src: string): HTMLElement | null {
  const doc = iframe.contentDocument;
  if (!doc) return null;
  if (!/^r\d+$/.test(elementId)) return null;
  const candidates = doc.querySelectorAll(`[${RENDERER_ELEMENT_ID_ATTR}="${elementId}"]`);
  if (candidates.length !== 1) return null;
  const candidate = candidates[0] ?? null;
  if (
    !candidate
    || candidate.getAttribute("data-cid") !== cid
    || (candidate.getAttribute("data-src") ?? "") !== src
  ) return null;
  const frameWindow = doc.defaultView;
  return frameWindow && candidate instanceof frameWindow.HTMLElement ? candidate : null;
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

function spacingDescriptorMatches(
  affordance: SpacingAffordance | null,
  descriptor: SpacingDescriptor | null | undefined,
): affordance is SpacingAffordance {
  return Boolean(affordance
    && descriptor
    && affordance.kind === descriptor.kind
    && affordance.property === descriptor.property
    && affordance.side === descriptor.side);
}

function applySpacingPreview(
  drag: CanvasSpacingDragState,
  point: { x: number; y: number },
): void {
  const value = spacingValueForDrag(drag.affordance, drag.start, point);
  drag.currentValue = value;
  drag.element.style.setProperty(drag.affordance.property, spacingValueCss(value));
}

function restoreSpacingPreview(drag: CanvasSpacingDragState): void {
  if (drag.originalInlineValue) {
    drag.element.style.setProperty(
      drag.affordance.property,
      drag.originalInlineValue,
      drag.originalInlinePriority,
    );
  } else {
    drag.element.style.removeProperty(drag.affordance.property);
  }
}

function commitSpacingDrag(drag: CanvasSpacingDragState): void {
  if (drag.currentValue === drag.startValue) {
    restoreSpacingPreview(drag);
    return;
  }
  // Restore the authored declaration before setStyle reads oldRawValue. If
  // the preview remains inline, the requested value becomes its own baseline
  // and the change log correctly treats the drag as a no-op.
  restoreSpacingPreview(drag);
  setStyle(
    drag.element,
    drag.affordance.property,
    spacingValueCss(drag.currentValue),
  );
}

function sendMeasureModifier(iframe: HTMLIFrameElement, cardId: string, altKey: boolean): void {
  iframe.contentWindow?.postMessage({
    type: "measure-modifier",
    protocolVersion: PROTOCOL_VERSION,
    projectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    cardId,
    altKey,
  }, window.location.origin);
}

export function CanvasElementOverlay(): ReactElement | null {
  const isInspectorOpen = useInspectorOpen();
  const [hover, setHover] = useState<FrameOverlayState | null>(null);
  const [measureState, setMeasureState] = useState<FrameMeasureState | null>(null);
  const [, refreshSelectedGeometry] = useReducer((revision: number) => revision + 1, 0);
  const selected = useSelectedElement();
  const selectedElements = useSelectedElements();
  const inlineTextSession = useInlineTextSession();
  const camera = useBoardCamera();
  const presentation = useCanvasPresentation();
  const presentationTransitioning = useCanvasPresentationTransitioning();
  const projectionZoom = presentation === "focus" ? 1 : camera.zoom;
  const cards = useCanvasCards(); // Projected geometry must follow card drag and resize updates.
  const cardGeometryKey = cards.map((card) => `${card.id}:${card.x}:${card.y}:${card.width}:${card.height}`).join("|");
  const projectionGeometryKey = `${presentation}:${camera.x}:${camera.y}:${projectionZoom}:${cardGeometryKey}`;
  const previousProjectionGeometryKey = useRef(projectionGeometryKey);
  const dragRef = useRef<CanvasDragState | null>(null);
  const spacingDragRef = useRef<CanvasSpacingDragState | null>(null);
  const measureAltKeyRef = useRef(false);
  const dropGuide = useDropGuide("canvas");
  const projectedDropGuide = projectGuideToCanvas(dropGuide, projectionZoom);

  const selectedFrame = selected?.domElement.ownerDocument.defaultView?.frameElement;
  const selectedInCanvas = selectedFrame instanceof HTMLIFrameElement
    && selectedFrame.hasAttribute("data-nudge-ui-canvas-renderer");
  const selectedRects = selectedInCanvas
    ? selectedElements.map((candidate) => {
      const frame = candidate.domElement.ownerDocument.defaultView?.frameElement;
      return frame === selectedFrame ? toRect(candidate.domElement.getBoundingClientRect()) : null;
    })
    : [];
  const selectedPrimaryIndex = selectedElements.findIndex((candidate) => candidate.domElement === selected?.domElement);
  const selectedLocalRect = selectedRects[selectedPrimaryIndex >= 0 ? selectedPrimaryIndex : 0] ?? null;
  const selectedFrameRect = selectedInCanvas
    ? toRect(selectedFrame.getBoundingClientRect())
    : null;
  const selectedRect = selectedInCanvas && selectedLocalRect
    ? projectRect(selectedFrame, selectedLocalRect, projectionZoom)
    : null;
  const projectedSelectedGeometry = selectedInCanvas
    ? selectedRects.flatMap((rect, index) => {
      const element = selectedElements[index];
      return rect && element
        ? [{ element, rect: projectRect(selectedFrame, rect, projectionZoom) }]
        : [];
    })
    : [];

  // Camera transforms commit on the board before iframe viewport geometry is
  // readable. Re-render once after that commit so overlays use the transformed
  // frame rectangle rather than the previous camera position.
  useLayoutEffect(() => {
    const geometryChanged = previousProjectionGeometryKey.current !== projectionGeometryKey;
    previousProjectionGeometryKey.current = projectionGeometryKey;
    if (selectedInCanvas && geometryChanged) refreshSelectedGeometry();
  }, [projectionGeometryKey, selectedInCanvas]);
  const selectedBorders = selectedInCanvas && selected
    ? readBorderWidths(selected.domElement)
    : null;

  useEffect(() => {
    if (!selectedInCanvas || !selected) return;
    const stops = selectedElements.map((candidate) => observeSelectedGeometry(candidate.domElement, refreshSelectedGeometry));
    return () => stops.forEach((stop) => stop());
  }, [selected, selectedElements, selectedInCanvas]);

  useEffect(() => {
    const broadcastMeasureModifier = (altKey: boolean): void => {
      measureAltKeyRef.current = altKey;
      for (const [cardId, iframe] of getRegisteredFrames()) {
        sendMeasureModifier(iframe, cardId, altKey);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Alt" || measureAltKeyRef.current) return;
      broadcastMeasureModifier(true);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === "Alt") broadcastMeasureModifier(false);
    };
    const onBlur = (): void => broadcastMeasureModifier(false);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // The selected element's identity is computed once per selection change
  // (never per hover), so the measurement self-rulers exclusion can compare
  // identities without a per-hover scan of the frame document.
  const selectedIdentity = useMemo((): ElementIdentity | null => {
    const el = selected?.domElement;
    if (!el) return null;
    const elementId = el.getAttribute(RENDERER_ELEMENT_ID_ATTR);
    return elementId ? { elementId } : null;
  }, [selected?.domElement]);

  useEffect(() => {
    const unsubscribe = subscribeCanvasRendererMessages(({
      cardId: sourceCardId,
      iframe: sourceIframe,
      identity: frameIdentity,
      message: data,
    }) => {
      if (data.type === "renderer-hello" || data.type === "frame-ready") {
        sendMeasureModifier(sourceIframe, sourceCardId, measureAltKeyRef.current);
      }
      if (data.type === "renderer-hello") return;

      if (data.type === "element-hover") {
        const msg = data;
        if (!msg.cid) return;
        if (msg.rect === null) {
          setHover((current) => current?.cardId === sourceCardId ? null : current);
          return;
        }
        setHover({
          iframe: sourceIframe,
          identity: { elementId: msg.elementId },
          rect: msg.rect,
          margins: msg.margins ?? { top: 0, right: 0, bottom: 0, left: 0 },
          borders: msg.borders ?? { top: 0, right: 0, bottom: 0, left: 0 },
          cardId: sourceCardId,
          point: msg.point ?? null,
          spacing: msg.spacing ?? null,
        });
      } else if (data.type === "element-measure-state") {
        const msg = data;
        setMeasureState({
          iframe: sourceIframe,
          altKey: msg.altKey,
          pointerOverPage: msg.pointerOverPage,
        });
      } else if (data.type === "element-click") {
        if (!isElementClickMessage(data, frameIdentity)) return;
        const msg = data;
        if (!msg.cid) return;
        handleElementClick(msg, sourceIframe, sourceCardId);
      } else if (data.type === "inline-text-intent") {
        if (!isInlineTextIntentMessage(data, frameIdentity)) return;
        if (getSelectedElements().length > 1) return;
        const emptyProjection = data.emptyProjectionId
          ? Array.from(sourceIframe.contentDocument?.querySelectorAll<Element>(`[${EMPTY_TEXT_PROJECTION_ATTR}]`) ?? [])
            .find((candidate) => candidate.getAttribute(EMPTY_TEXT_PROJECTION_ATTR) === data.emptyProjectionId)
          : null;
        const element = emptyProjection ?? findFrameElement(sourceIframe, data.elementId, data.cid, data.src);
        if (!element) return;
        handleInlineTextEditIntent(data.intent === "double-click"
          ? { kind: "double-click", target: element, point: data.point }
          : {
            kind: "pointer-down",
            target: element,
            point: data.point,
            clickCount: data.clickCount ?? 0,
          });
      } else if (data.type === "element-deselect") {
        if (spacingDragRef.current) restoreSpacingPreview(spacingDragRef.current);
        spacingDragRef.current = null;
        dragRef.current = null;
        clearDropGuide("canvas");
        setSelectedElement(null);
      } else if (data.type === "element-drag-start") {
        if (getSelectedElements().length > 1) return;
        const msg = data;
        const element = findFrameElement(sourceIframe, msg.elementId, msg.cid, msg.src);
        if (!element) return;
        if (spacingDragRef.current) restoreSpacingPreview(spacingDragRef.current);
        spacingDragRef.current = null;
        dragRef.current = null;
        const startPoint = msg.startPoint ?? msg.point;
        const spacing = msg.spacing
          ? getSpacingAffordanceForDescriptor(element, msg.spacing)
          : sourceIframe.contentDocument
            ? getSpacingAffordanceAtPoint(sourceIframe.contentDocument, startPoint.x, startPoint.y)
            : null;
        if (spacingDescriptorMatches(spacing, msg.spacing ?? (spacing ? {
          kind: spacing.kind,
          property: spacing.property,
          side: spacing.side,
        } : null)) && spacing.element === element) {
          spacingDragRef.current = {
            iframe: sourceIframe,
            element,
            affordance: spacing,
            start: startPoint,
            startValue: spacing.value,
            currentValue: spacing.value,
            originalInlineValue: element.style.getPropertyValue(spacing.property),
            originalInlinePriority: element.style.getPropertyPriority(spacing.property),
          };
          const selectedElement = resolveSelectionFromElement(element);
          if (selectedElement) setSelectedElement(selectedElement);
          applySpacingPreview(spacingDragRef.current, msg.point);
          return;
        }
        dragRef.current = { iframe: sourceIframe, element };
        const selectedElement = resolveSelectionFromElement(element);
        if (selectedElement) setSelectedElement(selectedElement);
        updateDropGuide(msg.point, sourceIframe);
      } else if (data.type === "element-drag-move") {
        const spacing = spacingDragRef.current;
        if (spacing && spacing.iframe === sourceIframe) {
          applySpacingPreview(spacing, data.point);
          return;
        }
        updateDropGuide(data.point, sourceIframe);
      } else if (data.type === "element-drag-end") {
        const msg = data;
        const spacing = spacingDragRef.current;
        if (spacing && spacing.iframe === sourceIframe) {
          if (msg.cancelled) {
            restoreSpacingPreview(spacing);
            spacingDragRef.current = null;
            clearDropGuide("canvas");
            return;
          }
          applySpacingPreview(spacing, msg.point);
          commitSpacingDrag(spacing);
          spacingDragRef.current = null;
          const selectedElement = resolveSelectionFromElement(spacing.element);
          if (selectedElement) setSelectedElement(selectedElement);
          return;
        }
        const current = dragRef.current;
        if (!msg.cancelled && current && current.iframe === sourceIframe && sourceIframe.contentDocument) {
          const drop = getDropLocationAtPoint(sourceIframe.contentDocument, current.element, msg.point.x, msg.point.y);
          if (drop) moveElement(current.element, drop);
          const selectedElement = resolveSelectionFromElement(current.element);
          if (selectedElement) setSelectedElement(selectedElement);
        }
        dragRef.current = null;
        clearDropGuide("canvas");
      } else if (data.type === "element-delete") {
        if (getSelectedElements().length !== 1) return;
        const msg = data;
        const element = findFrameElement(sourceIframe, msg.elementId, msg.cid, msg.src);
        const selectedElement = element ? resolveSelectionFromElement(element) : null;
        if (selectedElement && deleteElement(selectedElement)) setSelectedElement(null);
      } else if (data.type === "element-nudge") {
        if (getSelectedElements().length !== 1) return;
        const msg = data;
        const element = findFrameElement(sourceIframe, msg.elementId, msg.cid, msg.src);
        const record = element ? nudgeElement(element, msg.key) : null;
        if (element && record) {
          const selectedElement = resolveSelectionFromElement(element);
          if (selectedElement) setSelectedElement(selectedElement);
        }
      } else if (data.type === "history-request") {
        const msg = data;
        if (msg.action === "redo") {
          redo();
        } else {
          undo();
        }
      } else if (data.type === "inspector-toggle-request") {
        toggleInspector();
      } else if (data.type === "inspector-open-request") {
        setInspectorOpen(true);
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
    });
    return () => {
      unsubscribe();
      if (spacingDragRef.current) restoreSpacingPreview(spacingDragRef.current);
      spacingDragRef.current = null;
      dragRef.current = null;
      clearDropGuide("canvas");
    };
  }, []);

  if (!isInspectorOpen) return null;
  if (inlineTextSession && inlineTextSession.host.ownerDocument === selected?.domElement.ownerDocument) return null;
  if (!hover && projectedSelectedGeometry.length === 0 && !projectedDropGuide) return null;

  const projectedHoverRect = hover ? projectRect(hover.iframe, hover.rect, projectionZoom) : null;
  const spacingAffordance = hover?.point && hover.spacing && hover.iframe.contentDocument
    ? getSpacingAffordanceAtPoint(hover.iframe.contentDocument, hover.point.x, hover.point.y)
    : null;
  const projectedSpacingGuide = hover && spacingDescriptorMatches(spacingAffordance, hover.spacing)
    ? projectRect(hover.iframe, spacingAffordance.guide, projectionZoom)
    : null;
  const hoverMargins = hover ? scaleMargins(hover.margins, projectionZoom) : null;
  const hoverMarginGuides = projectedHoverRect && hoverMargins
    ? getMarginGuides(projectedHoverRect, hoverMargins)
    : [];
  const hoverMarginFills = projectedHoverRect && hoverMargins
    ? getMarginFills(projectedHoverRect, hoverMargins)
    : [];
  const measureStateForSelectedFrame = measureState?.iframe === selectedFrame ? measureState : null;
  const hoverInSelectedFrame = hover?.iframe === selectedFrame ? hover : null;
  const showGuideOverlay = Boolean(
    selectedElements.length === 1
    && selectedRect
    && selectedFrameRect
    && measureStateForSelectedFrame?.altKey
    && measureStateForSelectedFrame.pointerOverPage,
  );
  const isSelfHover = Boolean(
    hoverInSelectedFrame
    && selectedIdentity
    && hoverInSelectedFrame.identity.elementId === selectedIdentity.elementId,
  );
  const showMeasurement = Boolean(
    showGuideOverlay
    && selectedLocalRect
    && hoverInSelectedFrame
    && !isSelfHover,
  );
  const measurementSegments = showMeasurement && selectedFrameRect && selectedLocalRect && hoverInSelectedFrame
    ? projectMeasurementSegments(
      selectedFrameRect,
      getMeasurementGeometry(selectedLocalRect, hoverInSelectedFrame.rect, {
        selectedBorders: selectedBorders ?? undefined,
        hoveredBorders: hoverInSelectedFrame.borders,
      }).segments,
      projectionZoom,
    )
    : [];

  if (presentationTransitioning) return <style data-test="canvas-element-overlay-styles">{overlayStyles}</style>;

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
            <div key={fill.side} className="canvas-hover-margin-fill" data-side={fill.side} style={overlayStyle(fill)} aria-hidden="true" />
          ))}
          <div className="canvas-element-overlay" data-test="canvas-hover-outline" style={overlayStyle(projectedHoverRect)} aria-hidden="true" />
          {projectedSpacingGuide && spacingAffordance ? (
            <div
              className="canvas-spacing-guide"
              data-test="canvas-spacing-guide"
              data-kind={spacingAffordance.kind}
              data-property={spacingAffordance.property}
              data-side={spacingAffordance.side ?? undefined}
              style={overlayStyle(projectedSpacingGuide)}
              aria-hidden="true"
            />
          ) : null}
          {hoverMarginGuides.map((guide) => (
            <div key={guide.side} className="canvas-hover-margin" data-axis={guide.axis} data-distance={guide.distance} data-side={guide.side} style={overlayStyle(guide)} aria-hidden="true" />
          ))}
        </>
      ) : null}
      {projectedSelectedGeometry.map(({ element, rect }, index) => (
        <div
          key={`${element.cid}-${index}`}
          className="canvas-selected-outline"
          data-test="canvas-selected-outline"
          data-selected-cid={element.cid}
          data-selected-index={index}
          data-selected-src={element.src}
          style={overlayStyle(rect)}
          aria-hidden="true"
        />
      ))}
      <DropGuideOverlay
        guide={projectedDropGuide}
        lineClassName="canvas-dom-drop-line"
        lineTestId="canvas-dom-drop-line"
        targetClassName="canvas-dom-drop-target"
        targetTestId="canvas-dom-drop-target"
      />
    </>
  );
}
