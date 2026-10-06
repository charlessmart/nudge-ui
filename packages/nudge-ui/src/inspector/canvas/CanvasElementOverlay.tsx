import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type ReactElement } from "react";
import {
  PROTOCOL_VERSION,
  isElementClickMessage,
  isInlineTextIntentMessage,
} from "./frameProtocol.ts";
import { useCanvasCards } from "./canvasStore.ts";
import {
  useBoardCamera,
  useCanvasPresentation,
  useCanvasPresentationTransitioning,
  useCanvasLayoutTransitioning,
  getCanvasLayoutTransitioning,
  useTemporaryAppInteraction,
} from "./viewStore.ts";
import { handleElementClick } from "./rendererSelectionProxy.ts";
import { getSelectedElements, useHierarchy, useSelectedElement, useSelectedElements } from "../selection/selectionStore.ts";
import {
  readBorderWidths,
  toRect,
  type BorderWidths,
  type Rect,
} from "../overlay/overlayGeometry.ts";
import overlayStyles from "./CanvasElementOverlay.css?inline";
import { deleteElement, getDropLocationAtPoint, moveElement, nudgeElement } from "../overlay/structuralGestures.ts";
import { changeKey } from "../changes/model.ts";
import { getChanges, redo, subscribeChanges, undo, type ElementChangeRecord } from "../changes/changesLog.ts";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
import { setSelectedElement } from "../selection/selectionStore.ts";
import { clearDropGuide, showDropGuide, useDropGuide, type DropGuide } from "../overlay/dropGuide.ts";
import { DropGuideOverlay, type ViewportDropGuide } from "../overlay/DropGuideOverlay.tsx";
import { getMeasurementGeometry } from "../overlay/measurementGeometry.ts";
import { getElementComputedStyle } from "../runtime/domRealm.ts";
import { MeasurementGuideOverlay } from "../overlay/MeasurementGuideOverlay.tsx";
import { projectMeasurementSegments } from "./measurementProjection.ts";
import { getRegisteredFrames, PROJECT_ID, WORKSPACE_ID } from "./projection.ts";
import { RENDERER_ELEMENT_ID_ATTR } from "./rendererCidIndex.ts";
import { observeSelectedGeometry } from "../overlay/selectedGeometry.ts";
import { handleInlineTextEditIntent, useInlineTextSession } from "../inline-text/inlineTextEditor.ts";
import { setInspectorOpen, toggleInspector } from "../shell/openStore.ts";
import { EMPTY_TEXT_PROJECTION_ATTR } from "../projection/textProjection.ts";
import { subscribeCanvasRendererMessages } from "./rendererMessageRouter.ts";
import { setStyles } from "../tokens/editActions.ts";
import {
  getSpacingAffordanceAtPoint,
  getSpacingAffordanceForDescriptor,
  getSpacingHoverAtPoint,
  SPACING_GUIDE_HANDLE_LENGTH,
  spacingValueCss,
  spacingValueForDrag,
  type SpacingAffordance,
  type SpacingDescriptor,
} from "../overlay/spacingGestures.ts";
import { beginLayoutPreview, endLayoutPreview } from "../styleEditors/layoutPreviewState.ts";
import { useNudgeUiRuntimeConfig } from "../runtime/useRuntimeConfig.ts";
import { DomNavigator } from "../overlay/DomNavigator.tsx";

interface ElementIdentity {
  elementId: string;
}

interface FrameOverlayState {
  iframe: HTMLIFrameElement;
  identity: ElementIdentity;
  rect: Rect;
  borders: BorderWidths;
  cardId: string;
  spacing: SpacingDescriptor | null;
  spacingGuides: Rect[];
  spacingAreas: Rect[];
  /** Value badge for the spacing handle under the pointer. */
  spacingHandleBadge: { point: { x: number; y: number }; value: number } | null;
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

interface CanvasSpacingBadgeState {
  iframe: HTMLIFrameElement;
  point: { x: number; y: number };
  value: number;
}

/** A committed spacing drag whose preview inline is held until the renderer
 * applies the projected managed rule, so the authored value never flashes. */
interface PendingSpacingCommit {
  iframe: HTMLIFrameElement;
  element: HTMLElement;
  property: string;
  committedValue: string;
  /** Change keys created by the commit; gone once the rule is undone/reverted. */
  keys: string[];
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

function projectPoint(iframe: HTMLIFrameElement, x: number, y: number, zoom: number) {
  const frameRect = iframe.getBoundingClientRect();
  return {
    x: frameRect.left + x * zoom,
    y: frameRect.top + y * zoom,
  };
}

function spacingBadgeForDrag(
  drag: CanvasSpacingDragState,
  point: { x: number; y: number },
): CanvasSpacingBadgeState {
  return {
    iframe: drag.iframe,
    point: { x: point.x, y: point.y },
    value: drag.currentValue,
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

function spacingGuideStyle(rect: Rect): CSSProperties {
  const isHorizontal = rect.width >= rect.height;
  const width = isHorizontal ? Math.min(rect.width, SPACING_GUIDE_HANDLE_LENGTH) : rect.width;
  const height = isHorizontal ? rect.height : Math.min(rect.height, SPACING_GUIDE_HANDLE_LENGTH);

  return overlayStyle({
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  });
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
): boolean {
  return Boolean(affordance
    && descriptor
    && affordance.kind === descriptor.kind
    && affordance.property === descriptor.property
    && affordance.side === descriptor.side);
}

function clearSpacingDrag(ref: { current: CanvasSpacingDragState | null }): void {
  const drag = ref.current;
  ref.current = null;
  if (drag) restoreSpacingPreview(drag);
}

function applySpacingPreview(
  drag: CanvasSpacingDragState,
  point: { x: number; y: number },
  shiftKey = false,
): void {
  const value = spacingValueForDrag(drag.affordance, drag.start, point, shiftKey);
  drag.currentValue = value;
  beginLayoutPreview(drag.element, drag.affordance.property);
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
  endLayoutPreview(drag.element, drag.affordance.property);
}

/**
 * Commits a managed rule for the drag's final value. Returns the created change
 * records (empty for a no-op drag). The preview inline is intentionally left
 * applied at the committed value once a record exists; the caller must register
 * a PendingSpacingCommit and release it after the renderer acknowledges the
 * projected sheet. Restoring the authored declaration first would flash the old
 * value for the postMessage round trip the sheet takes.
 */
function commitSpacingDrag(drag: CanvasSpacingDragState): ElementChangeRecord[] {
  if (drag.currentValue === drag.startValue) {
    restoreSpacingPreview(drag);
    return [];
  }
  return setStyles(drag.element, [{
    property: drag.affordance.property,
    value: spacingValueCss(drag.currentValue),
    oldRawValue: spacingValueCss(drag.startValue),
  }]);
}

/** Removes a deferred preview inline as soon as the projected sheet alone
 * reproduces the committed value; keeps it otherwise and retries on the next
 * projection acknowledgement from that frame. */
function tryReleasePendingSpacingCommit(commit: PendingSpacingCommit): boolean {
  const { element, property, committedValue } = commit;
  if (!element.isConnected) return true;
  element.style.removeProperty(property);
  const computed = getElementComputedStyle(element).getPropertyValue(property).trim();
  if (computed === committedValue) {
    endLayoutPreview(element, property);
    return true;
  }
  element.style.setProperty(property, committedValue);
  return false;
}

function releasePendingSpacingCommits(
  pending: PendingSpacingCommit[],
  iframe: HTMLIFrameElement,
): void {
  if (pending.length === 0) return;
  let write = 0;
  for (const commit of pending) {
    if (commit.iframe !== iframe || !tryReleasePendingSpacingCommit(commit)) {
      pending[write] = commit;
      write += 1;
    }
  }
  pending.length = write;
}

/** Restores any held preview inline whose committed rule was undone, reverted,
 * or cleared before its sheet landed. Runs synchronously with the workspace
 * change, so the inline never outlives the intent behind it. */
function reconcilePendingSpacingCommits(pending: PendingSpacingCommit[]): void {
  if (pending.length === 0) return;
  const survivingKeys = new Set(getChanges().map(changeKey));
  let write = 0;
  for (const commit of pending) {
    if (commit.keys.some((key) => survivingKeys.has(key))) {
      pending[write] = commit;
      write += 1;
      continue;
    }
    const { element, property, originalInlineValue, originalInlinePriority } = commit;
    if (originalInlineValue) {
      element.style.setProperty(property, originalInlineValue, originalInlinePriority);
    } else {
      element.style.removeProperty(property);
    }
    endLayoutPreview(element, property);
  }
  pending.length = write;
}

/** Registers a held preview inline, folding an older unapplied commit for the
 * same element and property into the newest one so the held value and the
 * authored baseline both stay coherent across rapid successive drags. */
function pushPendingSpacingCommit(
  pending: PendingSpacingCommit[],
  next: PendingSpacingCommit,
): void {
  const existing = pending.findIndex((commit) => commit.iframe === next.iframe
    && commit.element === next.element
    && commit.property === next.property);
  if (existing === -1) {
    pending.push(next);
    return;
  }
  pending[existing] = {
    ...next,
    originalInlineValue: pending[existing]!.originalInlineValue,
    originalInlinePriority: pending[existing]!.originalInlinePriority,
  };
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
  const [hover, setHover] = useState<FrameOverlayState | null>(null);
  const [measureState, setMeasureState] = useState<FrameMeasureState | null>(null);
  const [, refreshSelectedGeometry] = useReducer((revision: number) => revision + 1, 0);
  const selected = useSelectedElement();
  const selectedElements = useSelectedElements();
  const hierarchy = useHierarchy();
  const domNavigationEnabled = useNudgeUiRuntimeConfig().capabilities.domNavigation === true;
  const inlineTextSession = useInlineTextSession();
  const camera = useBoardCamera();
  const presentation = useCanvasPresentation();
  const presentationTransitioning = useCanvasPresentationTransitioning();
  const layoutTransitioning = useCanvasLayoutTransitioning();
  const temporaryAppInteraction = useTemporaryAppInteraction();
  useEffect(() => {
    if (!layoutTransitioning) return;
    setHover(null);
    setMeasureState(null);
  }, [layoutTransitioning]);
  const projectionZoom = presentation === "focus" ? 1 : camera.zoom;
  const cards = useCanvasCards(); // Projected geometry must follow card drag and resize updates.
  const cardGeometryKey = cards.map((card) => `${card.id}:${card.x}:${card.y}:${card.width}:${card.height}`).join("|");
  const projectionGeometryKey = `${presentation}:${camera.x}:${camera.y}:${projectionZoom}:${cardGeometryKey}`;
  const previousProjectionGeometryKey = useRef(projectionGeometryKey);
  const dragRef = useRef<CanvasDragState | null>(null);
  const spacingDragRef = useRef<CanvasSpacingDragState | null>(null);
  const pendingSpacingCommitsRef = useRef<PendingSpacingCommit[]>([]);
  const [spacingDragBadge, setSpacingDragBadge] = useState<CanvasSpacingBadgeState | null>(null);
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

  // A held spacing preview inline must not outlive the committed rule behind
  // it: undo/redo/revert/clear remove the record synchronously, so restore the
  // authored declaration before the renderer's next replace-styles lands.
  useEffect(() => {
    return subscribeChanges(() => {
      reconcilePendingSpacingCommits(pendingSpacingCommitsRef.current);
    });
  }, []);

  useEffect(() => {
    const refreshSpacingPreviewOverlay = (drag: CanvasSpacingDragState): void => {
      const descriptor: SpacingDescriptor = {
        kind: drag.affordance.kind,
        property: drag.affordance.property,
        side: drag.affordance.side,
      };
      const affordance = getSpacingAffordanceForDescriptor(drag.element, descriptor);
      const rect = toRect(drag.element.getBoundingClientRect());
      const borders = readBorderWidths(drag.element);
      const elementId = drag.element.getAttribute(RENDERER_ELEMENT_ID_ATTR);
      setHover((current) => {
        if (!current
          || current.iframe !== drag.iframe
          || current.identity.elementId !== elementId
          || !current.spacing
          || current.spacing.kind !== descriptor.kind
          || current.spacing.property !== descriptor.property
          || current.spacing.side !== descriptor.side) {
          return current;
        }
        return {
          ...current,
          rect,
          borders,
          spacingGuides: affordance?.affectedGuides ?? [],
          spacingAreas: affordance?.affectedAreas ?? [],
          spacingHandleBadge: current.spacingHandleBadge && affordance
            ? { ...current.spacingHandleBadge, value: affordance.value }
            : current.spacingHandleBadge,
        };
      });
    };

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

      if (data.type === "projection-applied") {
        releasePendingSpacingCommits(pendingSpacingCommitsRef.current, sourceIframe);
        return;
      }

      if (getCanvasLayoutTransitioning()) return;

      if (data.type === "element-hover") {
        const msg = data;
        if (!msg.cid) return;
        if (msg.rect === null) {
          setHover((current) => current?.cardId === sourceCardId ? null : current);
          return;
        }
        const spacingDescriptor = msg.hoverSpacing ?? msg.spacing ?? null;
        const hoverPoint = msg.point ?? null;
        const hoverElement = spacingDescriptor
          ? findFrameElement(sourceIframe, msg.elementId, msg.cid, msg.src)
          : null;
        const hoverAffordance = spacingDescriptor && hoverElement
          ? getSpacingAffordanceForDescriptor(hoverElement, spacingDescriptor)
          : spacingDescriptor && hoverPoint && sourceIframe.contentDocument
            ? getSpacingHoverAtPoint(sourceIframe.contentDocument, hoverPoint.x, hoverPoint.y)
            : null;
        const matchingAffordance = spacingDescriptorMatches(hoverAffordance, spacingDescriptor)
          ? hoverAffordance
          : null;
        const spacingGuides = matchingAffordance?.affectedGuides ?? [];
        const spacingAreas = matchingAffordance?.affectedAreas ?? [];
        const handleAffordance = msg.spacing && hoverElement
          ? getSpacingAffordanceForDescriptor(hoverElement, msg.spacing)
          : null;
        const spacingHandleBadge = hoverPoint
          && handleAffordance
          && spacingDescriptorMatches(handleAffordance, msg.spacing)
          ? { point: hoverPoint, value: handleAffordance.value }
          : null;
        setHover({
          iframe: sourceIframe,
          identity: { elementId: msg.elementId },
          rect: msg.rect,
          borders: msg.borders ?? { top: 0, right: 0, bottom: 0, left: 0 },
          cardId: sourceCardId,
          spacing: spacingGuides.length > 0 ? spacingDescriptor : null,
          spacingGuides,
          spacingAreas,
          spacingHandleBadge,
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
        clearSpacingDrag(spacingDragRef);
        setSpacingDragBadge(null);
        dragRef.current = null;
        clearDropGuide("canvas");
        setSelectedElement(null);
      } else if (data.type === "element-drag-start") {
        if (getSelectedElements().length > 1) return;
        const msg = data;
        const element = findFrameElement(sourceIframe, msg.elementId, msg.cid, msg.src);
        if (!element) return;
        clearSpacingDrag(spacingDragRef);
        dragRef.current = null;
        const startPoint = msg.startPoint ?? msg.point;
        const spacing = msg.spacing
          ? getSpacingAffordanceForDescriptor(element, msg.spacing)
          : sourceIframe.contentDocument
            ? getSpacingAffordanceAtPoint(sourceIframe.contentDocument, startPoint.x, startPoint.y)
            : null;
        const isSpacingDrag = spacing
          && spacing.element === element
          && (!msg.spacing || spacingDescriptorMatches(spacing, msg.spacing));
        if (isSpacingDrag) {
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
          applySpacingPreview(spacingDragRef.current, msg.point, msg.shiftKey === true);
          setSpacingDragBadge(spacingBadgeForDrag(spacingDragRef.current, msg.point));
          refreshSpacingPreviewOverlay(spacingDragRef.current);
          return;
        }
        dragRef.current = { iframe: sourceIframe, element };
        const selectedElement = resolveSelectionFromElement(element);
        if (selectedElement) setSelectedElement(selectedElement);
        updateDropGuide(msg.point, sourceIframe);
      } else if (data.type === "element-drag-move") {
        const spacing = spacingDragRef.current;
        if (spacing && spacing.iframe === sourceIframe) {
          applySpacingPreview(spacing, data.point, data.shiftKey === true);
          setSpacingDragBadge(spacingBadgeForDrag(spacing, data.point));
          refreshSpacingPreviewOverlay(spacing);
          return;
        }
        updateDropGuide(data.point, sourceIframe);
      } else if (data.type === "element-drag-end") {
        const msg = data;
        const spacing = spacingDragRef.current;
        if (spacing && spacing.iframe === sourceIframe) {
          spacingDragRef.current = null;
          setSpacingDragBadge(null);
          if (msg.cancelled) {
            restoreSpacingPreview(spacing);
            refreshSpacingPreviewOverlay(spacing);
          } else {
            applySpacingPreview(spacing, msg.point, msg.shiftKey === true);
            const records = commitSpacingDrag(spacing);
            if (records.length > 0) {
              pushPendingSpacingCommit(pendingSpacingCommitsRef.current, {
                iframe: sourceIframe,
                element: spacing.element,
                property: spacing.affordance.property,
                committedValue: spacingValueCss(spacing.currentValue),
                keys: records.map((record) => changeKey(record)),
                originalInlineValue: spacing.originalInlineValue,
                originalInlinePriority: spacing.originalInlinePriority,
              });
            }
            refreshSpacingPreviewOverlay(spacing);
          }
          clearDropGuide("canvas");
          if (!msg.cancelled) {
            const selectedElement = resolveSelectionFromElement(spacing.element);
            if (selectedElement) setSelectedElement(selectedElement);
          }
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
      clearSpacingDrag(spacingDragRef);
      dragRef.current = null;
      pendingSpacingCommitsRef.current = [];
      clearDropGuide("canvas");
    };
  }, []);

  if (inlineTextSession && inlineTextSession.host.ownerDocument === selected?.domElement.ownerDocument) return null;
  if (!hover && projectedSelectedGeometry.length === 0 && !projectedDropGuide) return null;

  const projectedHoverRect = hover ? projectRect(hover.iframe, hover.rect, projectionZoom) : null;
  const projectedSpacingGuides = hover?.spacingGuides.map((guide) => projectRect(hover.iframe, guide, projectionZoom)) ?? [];
  const projectedSpacingAreas = hover?.spacingAreas.map((area) => projectRect(hover.iframe, area, projectionZoom)) ?? [];
  const spacingBadge = spacingDragBadge
    ?? (hover?.spacingHandleBadge ? { iframe: hover.iframe, ...hover.spacingHandleBadge } : null);
  const projectedSpacingBadge = spacingBadge
    ? projectPoint(spacingBadge.iframe, spacingBadge.point.x, spacingBadge.point.y, projectionZoom)
    : null;
  const hoverSpacing = hover?.spacing ?? null;
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
  // Selected elements already have a live geometry outline. The hover outline
  // is based on a cached renderer message and can lag during spacing previews.
  const showHoverOutline = Boolean(projectedHoverRect && !isSelfHover);
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

  if (presentationTransitioning || layoutTransitioning || temporaryAppInteraction) return <style data-test="canvas-element-overlay-styles">{overlayStyles}</style>;

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
          {hoverSpacing ? projectedSpacingAreas.map((area, index) => (
            <div
              key={`${hoverSpacing.property}-area-${index}`}
              className="canvas-spacing-fill"
              data-test="canvas-spacing-fill"
              data-kind={hoverSpacing.kind}
              data-property={hoverSpacing.property}
              data-side={hoverSpacing.side ?? undefined}
              data-area-index={index}
              style={overlayStyle(area)}
              aria-hidden="true"
            />
          )) : null}
          {showHoverOutline ? (
            <div className="canvas-element-overlay" data-test="canvas-hover-outline" style={overlayStyle(projectedHoverRect)} aria-hidden="true" />
          ) : null}
          {hoverSpacing ? projectedSpacingGuides.map((guide, index) => (
            <div
              key={`${hoverSpacing.property}-${index}`}
              className="canvas-spacing-guide"
              data-test="canvas-spacing-guide"
              data-kind={hoverSpacing.kind}
              data-property={hoverSpacing.property}
              data-side={hoverSpacing.side ?? undefined}
              data-guide-index={index}
              style={spacingGuideStyle(guide)}
              aria-hidden="true"
            />
          )) : null}
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
      {projectedSpacingBadge && spacingBadge ? (
        <div
          className="canvas-spacing-value-badge"
          data-test="canvas-spacing-value-badge"
          style={{ left: projectedSpacingBadge.x, top: projectedSpacingBadge.y }}
          aria-hidden="true"
        >
          {spacingValueCss(spacingBadge.value)}
        </div>
      ) : null}
      {domNavigationEnabled && !inlineTextSession && selectedElements.length === 1 && selected && selectedRect && selectedFrame instanceof HTMLIFrameElement ? (
        <DomNavigator
          selected={selected}
          hierarchy={hierarchy}
          anchor={selectedRect}
          project={(element) => element.ownerDocument === selected.domElement.ownerDocument
            ? projectRect(selectedFrame, toRect(element.getBoundingClientRect()), projectionZoom)
            : null}
        />
      ) : null}
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
