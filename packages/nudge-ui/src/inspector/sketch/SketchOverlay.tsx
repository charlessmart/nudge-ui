import { useEffect, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from "react";
import { Dialog } from "@base-ui/react/dialog";
import { getSketchViewport, type SketchViewport } from "./capture.ts";
import {
  SKETCH_LIMITS,
  SKETCH_STROKE_OUTLINE,
  SKETCH_RECTANGLE_STROKE_WIDTH,
  SKETCH_STROKE_WIDTH,
  SKETCH_TEXT_FONT_SIZE,
  SKETCH_TEXT_LINE_HEIGHT,
  type SketchPoint,
  type SketchStroke,
} from "./model.ts";
import { findErasedSketchStrokeIds, findSketchElementAt } from "./geometry.ts";
import {
  EMPTY_SKETCH_HISTORY,
  addSketchStroke,
  eraseSketchStrokes,
  redoSketchEdit,
  transformSketchStroke,
  undoSketchEdit,
  type SketchHistory,
} from "./history.ts";
import {
  frameHandleCursor,
  hitTestFrame,
  strokeFrame,
  transformStrokeWithHandle,
  type FrameHandle,
  type SketchRegion,
} from "./selectionFrame.ts";
import { SketchSelectionFrame } from "./SketchSelectionFrame.tsx";
import { resetSketchDrawingTool, useSketchDrawingTools, type SketchDrawingTool } from "./drawingTools.ts";
import { SketchSvgLayer } from "./freehand.tsx";
import { SketchTextEditor, type SketchTextEdit } from "./SketchTextEditor.tsx";
import { createTextStroke, fitTextStroke, retypeTextStroke } from "./text.ts";
import { publishLiveSketchControls } from "./liveSketch.ts";
import { useInspectorOpen } from "../shell/openStore.ts";
import { isEditableEvent } from "../shell/shortcuts.ts";
import { ERASER_CURSOR, SKETCH_CURSOR } from "../ui/customCursors.ts";
import { useTemporaryAppInteraction } from "../canvas/viewStore.ts";
import { portalContainer } from "../ui/portalContainer.ts";
import { showToast } from "../ui/Toast.tsx";

const TEXT_TOO_LONG = "That line is too long to fit in the sketch. Try shorter lines.";

/** Screen-pixel eraser reach; must match the cursor ring. */
const ERASER_RADIUS_PX = 8;

function sketchCursor(tool: SketchDrawingTool): string {
  if (tool === "eraser") return ERASER_CURSOR;
  if (tool === "rectangle") return "crosshair";
  if (tool === "text") return "text";
  return SKETCH_CURSOR;
}

export interface SketchLiveDraft {
  /** Always empty for live sketches; kept for compatibility with sketches saved with a note. */
  readonly description: string;
  readonly strokes: readonly SketchStroke[];
  readonly viewport: SketchViewport;
}

export interface SketchOverlayProps {
  readonly open: boolean;
  readonly hostElement: HTMLElement;
  readonly selectTarget?: (point: SketchPoint, lockedTarget: HTMLElement | null) => HTMLElement | null;
  readonly onCancel: () => void;
  /** Resolves once the sketch has been copied; the overlay then clears itself. */
  readonly onDone: (draft: SketchLiveDraft) => Promise<void>;
}

function clamp(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, value));
}

/** Page coordinates under the pointer, not limited to the viewport. */
function openPointFromEvent(
  event: { readonly clientX: number; readonly clientY: number },
  viewport: SketchViewport,
): SketchPoint {
  return {
    x: ((event.clientX - viewport.offsetX) / Math.max(1, viewport.displayWidth)) * viewport.width + viewport.scrollX,
    y: ((event.clientY - viewport.offsetY) / Math.max(1, viewport.displayHeight)) * viewport.height + viewport.scrollY,
  };
}

function pointFromEvent(
  event: ReactPointerEvent<SVGSVGElement>,
  viewport: SketchViewport,
): SketchPoint {
  const point = openPointFromEvent(event, viewport);
  return {
    x: clamp(point.x - viewport.scrollX, viewport.width) + viewport.scrollX,
    y: clamp(point.y - viewport.scrollY, viewport.height) + viewport.scrollY,
  };
}

/** Strokes live in page coordinates, so the drawable area moves with the scroll position. */
function viewportRegion(viewport: SketchViewport): SketchRegion {
  return {
    minX: viewport.scrollX,
    minY: viewport.scrollY,
    maxX: viewport.scrollX + viewport.width,
    maxY: viewport.scrollY + viewport.height,
  };
}

interface FrameGesture {
  readonly handle: FrameHandle;
  readonly start: SketchStroke;
  readonly pointerStart: SketchPoint;
  readonly gesture: number;
}

function distance(left: SketchPoint, right: SketchPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function visibleStroke(stroke: SketchStroke, viewport: SketchViewport): SketchStroke {
  return {
    ...stroke,
    points: stroke.points.map((point) => ({
      x: point.x - viewport.scrollX,
      y: point.y - viewport.scrollY,
    })),
  };
}

function rectanglePoints(start: SketchPoint, end: SketchPoint): SketchPoint[] {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
    { x: left, y: top },
  ];
}

export function SketchOverlay({ open, hostElement, selectTarget, onCancel, onDone }: SketchOverlayProps): ReactElement | null {
  const temporaryAppInteraction = useTemporaryAppInteraction();
  const inspectorOpen = useInspectorOpen();
  const [viewport, setViewport] = useState<SketchViewport>(() => getSketchViewport(hostElement));
  const drawing = useSketchDrawingTools();
  const tool = drawing.tool;
  const [history, setHistory] = useState<SketchHistory>(EMPTY_SKETCH_HISTORY);
  const [draftPoints, setDraftPoints] = useState<readonly SketchPoint[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [textEdit, setTextEdit] = useState<SketchTextEdit | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const targetRef = useRef(hostElement);
  const pointerId = useRef<number | null>(null);
  const draftPointsRef = useRef<readonly SketchPoint[]>([]);
  const draftPointLimitReached = useRef(false);
  const eraserPoint = useRef<SketchPoint | null>(null);
  // Identifies the current eraser drag so it undoes as a single edit.
  const eraseGesture = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverHandle, setHoverHandle] = useState<FrameHandle | null>(null);
  const [activeHandle, setActiveHandle] = useState<FrameHandle | null>(null);
  const frameGesture = useRef<FrameGesture | null>(null);
  const frameGestureCount = useRef(0);

  const strokes = history.strokes;
  const selected = tool === "eraser" || textEdit ? null : strokes.find((stroke) => stroke.id === selectedId) ?? null;
  const unit = viewport.width / Math.max(1, viewport.displayWidth);

  function updateDraftPoints(next: readonly SketchPoint[]): void {
    draftPointsRef.current = next;
    setDraftPoints(next);
  }

  useEffect(() => {
    if (!open) return;
    targetRef.current = hostElement;
    setViewport(getSketchViewport(hostElement));
    resetSketchDrawingTool();
    setHistory(EMPTY_SKETCH_HISTORY);
    updateDraftPoints([]);
    // Closing mid-stroke unmounts the surface before its pointerup arrives.
    pointerId.current = null;
    eraserPoint.current = null;
    frameGesture.current = null;
    setSelectedId(null);
    setHoverHandle(null);
    setActiveHandle(null);
    setTextEdit(null);
    setSubmitting(false);
  // Choosing the first stroke's frame must preserve the stroke already in progress.
  }, [open]);

  useEffect(() => {
    if (!open) return;
    targetRef.current = hostElement;
    const updateViewport = (): void => setViewport(getSketchViewport(hostElement));
    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("scroll", updateViewport, true);
    const frameWindow = typeof HTMLIFrameElement !== "undefined"
      && hostElement instanceof HTMLIFrameElement
      ? hostElement.contentWindow
      : null;
    frameWindow?.addEventListener("resize", updateViewport);
    frameWindow?.addEventListener("scroll", updateViewport, true);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("scroll", updateViewport, true);
      frameWindow?.removeEventListener("resize", updateViewport);
      frameWindow?.removeEventListener("scroll", updateViewport, true);
    };
  }, [hostElement, open]);

  useEffect(() => {
    if (open) svgRef.current?.focus();
  }, [open]);

  // Window-level so shortcuts work while focus is in the canvas toolbar; text fields keep their native undo.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || isEditableEvent(event)) return;
      const key = event.key.toLowerCase();
      const isRedo = (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
      const isUndo = key === "z" && !event.shiftKey;
      if (!isRedo && !isUndo) return;
      event.preventDefault();
      event.stopPropagation();
      setHistory((current) => isRedo ? redoSketchEdit(current) : undoSketchEdit(current));
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  function eraseAlong(start: SketchPoint, end: SketchPoint, drawingViewport: SketchViewport): void {
    const radius = ERASER_RADIUS_PX * (drawingViewport.width / Math.max(1, drawingViewport.displayWidth));
    const gesture = eraseGesture.current;
    setHistory((current) => eraseSketchStrokes(
      current,
      findErasedSketchStrokeIds(start, end, current.strokes, radius),
      gesture,
    ));
  }

  function beginFrameGesture(event: ReactPointerEvent<SVGSVGElement>, handle: FrameHandle, stroke: SketchStroke): void {
    event.preventDefault();
    svgRef.current?.focus({ preventScroll: true });
    pointerId.current = event.pointerId;
    frameGestureCount.current += 1;
    frameGesture.current = {
      handle,
      start: stroke,
      pointerStart: openPointFromEvent(event, viewport),
      gesture: frameGestureCount.current,
    };
    setActiveHandle(handle);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateFrameGesture(event: ReactPointerEvent<SVGSVGElement>, active: FrameGesture): void {
    const point = openPointFromEvent(event, viewport);
    const region = viewportRegion(viewport);
    const next = transformStrokeWithHandle(active.handle, active.start, active.pointerStart, point, region, event.shiftKey);
    setHistory((current) => transformSketchStroke(current, next, active.gesture));
  }

  function updateHoverHandle(event: ReactPointerEvent<SVGSVGElement>): void {
    const handle = selected && pointerId.current === null
      ? hitTestFrame(strokeFrame(selected), openPointFromEvent(event, viewport), unit)
      : null;
    setHoverHandle((current) => current === handle ? current : handle);
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    if (submitting || pointerId.current !== null) return;
    // Handles can sit outside the frame being drawn on, so they are tested before the target.
    if (selected) {
      const handle = hitTestFrame(strokeFrame(selected), openPointFromEvent(event, viewport), unit);
      if (handle) {
        beginFrameGesture(event, handle, selected);
        return;
      }
    }
    let drawingViewport = getSketchViewport(targetRef.current);
    if (selectTarget) {
      const target = selectTarget({ x: event.clientX, y: event.clientY },
        history.undo.length > 0 || history.redo.length > 0 ? targetRef.current : null);
      if (!target) return;
      if (target !== targetRef.current) {
        targetRef.current = target;
        drawingViewport = getSketchViewport(target);
        setViewport(drawingViewport);
      }
    }
    if (event.clientX < drawingViewport.offsetX || event.clientX > drawingViewport.offsetX + drawingViewport.displayWidth
      || event.clientY < drawingViewport.offsetY || event.clientY > drawingViewport.offsetY + drawingViewport.displayHeight) return;
    const point = pointFromEvent(event, drawingViewport);

    // Drawing cancels the browser's focus change, so move focus here or undo goes to the note or toolbar.
    event.preventDefault();
    svgRef.current?.focus({ preventScroll: true });
    pointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "eraser") {
      eraserPoint.current = point;
      eraseGesture.current += 1;
      eraseAlong(point, point, drawingViewport);
      return;
    }

    draftPointLimitReached.current = false;
    setSelectedId(null);
    updateDraftPoints([point]);
  }

  function beginTextEdit(point: SketchPoint): void {
    const existing = findSketchElementAt(point, strokes, []);
    const layer = existing?.kind === "stroke"
      ? strokes.find((stroke) => stroke.id === existing.id && stroke.kind === "text")
      : undefined;
    if (layer) {
      setSelectedId(layer.id);
      setTextEdit({
        id: layer.id,
        corner: layer.points[0] ?? point,
        rotation: layer.rotation ?? 0,
        fontSize: layer.fontSize ?? SKETCH_TEXT_FONT_SIZE,
        color: layer.color,
        initialText: layer.text ?? "",
        replacing: true,
      });
      return;
    }
    // The click marks where the first line starts, so the caret lands under the pointer.
    setTextEdit({
      id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      corner: { x: point.x, y: point.y - (SKETCH_TEXT_FONT_SIZE * SKETCH_TEXT_LINE_HEIGHT) / 2 },
      rotation: 0,
      fontSize: SKETCH_TEXT_FONT_SIZE,
      color: drawing.color.value,
      initialText: "",
      replacing: false,
    });
    setSelectedId(null);
  }

  function commitText(edit: SketchTextEdit, value: string): void {
    setTextEdit(null);
    const text = value.trim();
    const current = strokes.find((stroke) => stroke.id === edit.id);
    if (text === "") {
      if (current) {
        eraseGesture.current += 1;
        const gesture = eraseGesture.current;
        setHistory((current) => eraseSketchStrokes(current, [edit.id], gesture));
        setSelectedId(null);
      }
      return;
    }
    if (current) {
      if (text === current.text) {
        setSelectedId(current.id);
        return;
      }
      frameGestureCount.current += 1;
      const gesture = frameGestureCount.current;
      const next = fitTextStroke(retypeTextStroke(current, text), viewportRegion(viewport));
      setSelectedId(current.id);
      if (!next) {
        showToast({ tone: "error", title: "Text not changed", description: TEXT_TOO_LONG });
        return;
      }
      setHistory((current) => transformSketchStroke(current, next, gesture));
      return;
    }
    const totalPoints = strokes.reduce((total, stroke) => total + stroke.points.length, 0) + 5;
    if (strokes.length >= SKETCH_LIMITS.strokes || totalPoints > SKETCH_LIMITS.points) {
      showToast({ tone: "error", title: "Text not added", description: "The sketch has reached its limit. Erase a mark before adding more." });
      return;
    }
    const layer = fitTextStroke(createTextStroke({
      id: edit.id,
      corner: edit.corner,
      text,
      fontSize: edit.fontSize,
      color: edit.color,
    }), viewportRegion(viewport));
    if (!layer) {
      showToast({ tone: "error", title: "Text not added", description: TEXT_TOO_LONG });
      return;
    }
    setHistory((current) => addSketchStroke(current, layer));
    setSelectedId(layer.id);
  }

  function onDoubleClick(event: ReactMouseEvent<SVGSVGElement>): void {
    if (submitting || textEdit) return;
    const point = openPointFromEvent(event, viewport);
    const hit = findSketchElementAt(point, strokes, []);
    if (hit?.kind === "stroke" && strokes.some((stroke) => stroke.id === hit.id && stroke.kind === "text")) {
      beginTextEdit(point);
    }
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
    if (pointerId.current !== event.pointerId) {
      updateHoverHandle(event);
      return;
    }
    event.preventDefault();
    if (frameGesture.current) {
      updateFrameGesture(event, frameGesture.current);
      return;
    }
    const point = pointFromEvent(event, viewport);
    if (eraserPoint.current) {
      eraseAlong(eraserPoint.current, point, viewport);
      eraserPoint.current = point;
      return;
    }
    const previous = draftPointsRef.current;
    const last = previous.at(-1);
    if (last && distance(last, point) < 1) return;
    if (previous.length >= SKETCH_LIMITS.points) {
      draftPointLimitReached.current = true;
      return;
    }
    updateDraftPoints([...previous, point]);
  }

  function finishPointer(event: ReactPointerEvent<SVGSVGElement>): void {
    if (pointerId.current !== event.pointerId) return;
    pointerId.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
    if (frameGesture.current) {
      frameGesture.current = null;
      setActiveHandle(null);
      return;
    }
    if (eraserPoint.current) {
      eraserPoint.current = null;
      return;
    }
    const previous = draftPointsRef.current;
    updateDraftPoints([]);
    if (draftPointLimitReached.current) {
      draftPointLimitReached.current = false;
      showToast({
        tone: "error",
        title: "Stroke discarded",
        description: `A stroke can contain at most ${SKETCH_LIMITS.points.toLocaleString()} points.`,
      });
      return;
    }
    if (previous.length === 0) return;
    if (tool === "text") {
      beginTextEdit(previous[0]!);
      return;
    }
    // A click that draws nothing selects the stroke under it, or clears the selection.
    if (previous.length < 2 || (tool === "rectangle" && distance(previous[0]!, previous.at(-1)!) < 1)) {
      const hit = findSketchElementAt(previous[0]!, strokes, []);
      setSelectedId(hit?.kind === "stroke" ? hit.id : null);
      return;
    }
    const points = tool === "rectangle" && previous.length > 1
      ? rectanglePoints(previous[0]!, previous.at(-1)!)
      : previous;
    const totalPoints = strokes.reduce((total, stroke) => total + stroke.points.length, 0) + points.length;
    if (strokes.length >= SKETCH_LIMITS.strokes || totalPoints > SKETCH_LIMITS.points) {
      showToast({ tone: "error", title: "Stroke not added", description: "The sketch has reached its limit. Erase a mark before drawing again." });
      return;
    }
    const stroke: SketchStroke = {
      id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      kind: tool === "rectangle" ? "rectangle" : "freehand",
      width: tool === "rectangle" ? SKETCH_RECTANGLE_STROKE_WIDTH : SKETCH_STROKE_WIDTH,
      color: drawing.color.value,
      outlineColor: SKETCH_STROKE_OUTLINE,
      points: points.map((point) => ({ ...point })),
    };
    setHistory((current) => addSketchStroke(current, stroke));
    setSelectedId(stroke.id);
  }

  async function copySketch(): Promise<void> {
    if (submitting || strokes.length === 0) return;
    setSubmitting(true);
    try {
      await onDone({
        description: "",
        strokes: strokes.map((stroke) => ({
          ...stroke,
          points: stroke.points.map((point) => ({ ...point })),
        })),
        viewport: getSketchViewport(hostElement),
      });
      // Once copied the sketch is done with: the canvas starts empty again and the tool stays open for the next one.
      setHistory(EMPTY_SKETCH_HISTORY);
      setSelectedId(null);
      setTextEdit(null);
      setSubmitting(false);
    } catch (doneError) {
      showToast({
        tone: "error",
        title: "Sketch not copied",
        description: doneError instanceof Error ? doneError.message : "The sketch could not be saved.",
      });
      setSubmitting(false);
    }
  }

  // The toolbar's button lives outside this component; it calls through a ref so it never acts on stale strokes.
  const copyRef = useRef(copySketch);
  copyRef.current = copySketch;
  const hasContent = strokes.length > 0;
  useEffect(() => {
    if (!open) return;
    publishLiveSketchControls({
      hasContent,
      saving: submitting,
      copy: () => void copyRef.current(),
    });
    return () => publishLiveSketchControls(null);
  }, [hasContent, open, submitting]);

  // The layer being retyped is drawn by the editor instead.
  const visibleStrokes = strokes
    .filter((stroke) => stroke.id !== textEdit?.id)
    .map((stroke) => visibleStroke(stroke, viewport));
  const visibleSelected = selected ? visibleStroke(selected, viewport) : null;
  const frameHandle = activeHandle ?? hoverHandle;
  const cursor = selected && frameHandle
    ? frameHandleCursor(frameHandle, strokeFrame(selected), activeHandle !== null)
    : sketchCursor(tool);
  const draftStroke: SketchStroke | null = draftPoints.length > 0 && tool !== "text" ? {
    id: "draft",
    kind: tool === "rectangle" ? "rectangle" as const : "freehand" as const,
    width: tool === "rectangle" ? SKETCH_RECTANGLE_STROKE_WIDTH : SKETCH_STROKE_WIDTH,
    color: drawing.color.value,
    outlineColor: SKETCH_STROKE_OUTLINE,
    points: (tool === "rectangle" && draftPoints.length > 1
      ? rectanglePoints(draftPoints[0]!, draftPoints.at(-1)!)
      : draftPoints
    ).map((point) => ({
      x: point.x - viewport.scrollX,
      y: point.y - viewport.scrollY,
    })),
  } : null;

  if (!open) return null;

  return (
    <Dialog.Root
      open={open}
      modal={false}
      disablePointerDismissal
      onOpenChange={(nextOpen) => { if (!nextOpen && !submitting && !textEdit) onCancel(); }}
    >
      <Dialog.Portal container={portalContainer()}>
        <Dialog.Backdrop
          style={{ visibility: temporaryAppInteraction ? "hidden" : undefined }}
          className="sketch__backdrop sketch__live-backdrop"
          data-inspector-open={inspectorOpen ? "true" : "false"}
          data-test="sketch-live-backdrop"
        />
        <Dialog.Popup
          style={{ visibility: temporaryAppInteraction ? "hidden" : undefined }}
          className="sketch__popup sketch__live-popup"
          data-inspector-open={inspectorOpen ? "true" : "false"}
          data-test="sketch-live-editor"
        >
          <Dialog.Title className="sketch__title sketch__sr-only">Sketch viewport</Dialog.Title>
          <Dialog.Description className="sketch__description sketch__sr-only">
            Draw or type directly over the live interface, then copy the sketch.
          </Dialog.Description>
          {selectTarget ? (
            <svg
              className="sketch__target-surface"
              aria-hidden="true"
              style={{ cursor }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHoverHandle(null)}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
            />
          ) : null}
          <div
            className="sketch__canvas-frame sketch__live-frame"
            style={{
              left: viewport.offsetX,
              top: viewport.offsetY,
              width: viewport.displayWidth,
              height: viewport.displayHeight,
            }}
          >
            <svg
              ref={svgRef}
              className={`sketch__canvas sketch__live-canvas sketch__canvas--${tool}`}
              width={viewport.width}
              height={viewport.height}
              viewBox={`0 0 ${viewport.width} ${viewport.height}`}
              preserveAspectRatio="none"
              pointerEvents="all"
              style={{ cursor }}
              tabIndex={0}
              aria-label="Sketch over the live interface"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHoverHandle(null)}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
              onDoubleClick={onDoubleClick}
            >
              <SketchSvgLayer strokes={draftStroke ? [...visibleStrokes, draftStroke] : visibleStrokes} />
              {visibleSelected && !draftStroke ? <SketchSelectionFrame stroke={visibleSelected} unit={unit} /> : null}
            </svg>
            {textEdit ? (
              <SketchTextEditor
                key={textEdit.id}
                edit={textEdit}
                viewport={viewport}
                unit={unit}
                onCommit={(value) => commitText(textEdit, value)}
                onCancel={() => setTextEdit(null)}
              />
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
