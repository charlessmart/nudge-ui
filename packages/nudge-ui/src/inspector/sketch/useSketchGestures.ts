import { useEffect, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { getSketchViewport, type SketchViewport } from "./viewport.ts";
import {
  SKETCH_LIMITS,
  SKETCH_RECTANGLE_STROKE_WIDTH,
  SKETCH_STROKE_WIDTH,
  SKETCH_TEXT_FONT_SIZE,
  SKETCH_TEXT_LINE_HEIGHT,
  type SketchPoint,
  type SketchStroke,
  type SketchStrokeColor,
} from "./model.ts";
import { findErasedSketchStrokeIds, findSketchElementAt, rectanglePoints } from "./geometry.ts";
import type { SketchHistory } from "./history.ts";
import {
  frameHandleCursor,
  hitTestFrame,
  strokeFrame,
  transformStrokeWithHandle,
  type FrameHandle,
  type SketchRegion,
} from "./selectionFrame.ts";
import type { SketchDrawingTool } from "./drawingTools.ts";
import type { SketchTextEdit } from "./SketchTextEditor.tsx";
import { createTextStroke, fitTextStroke, retypeTextStroke } from "./text.ts";
import { ERASER_CURSOR, SKETCH_CURSOR } from "../ui/customCursors.ts";
import { showToast } from "../ui/Toast.tsx";

const TEXT_TOO_LONG = "That line is too long to fit in the sketch. Try shorter lines.";
/** Screen-pixel eraser reach; must match the cursor ring. */
const ERASER_RADIUS_PX = 8;

export interface SketchGestureOptions {
  readonly open: boolean;
  readonly hostElement: HTMLElement;
  readonly viewport: SketchViewport;
  readonly setViewport: (viewport: SketchViewport) => void;
  readonly tool: SketchDrawingTool;
  readonly color: SketchStrokeColor;
  readonly submitting: boolean;
  readonly textEdit: SketchTextEdit | null;
  readonly setTextEdit: (edit: SketchTextEdit | null) => void;
  readonly history: SketchHistory;
  readonly addStroke: (stroke: SketchStroke) => void;
  readonly eraseStrokes: (ids: readonly string[], gesture: number) => void;
  readonly transformStroke: (stroke: SketchStroke, gesture: number) => void;
  readonly selectTarget?: (point: SketchPoint) => HTMLElement | null;
  readonly svgRef: { readonly current: SVGSVGElement | null };
}

export interface SketchGestures {
  readonly draftPoints: readonly SketchPoint[];
  readonly selected: SketchStroke | null;
  readonly cursor: string;
  readonly onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  readonly onPointerLeave: () => void;
  readonly onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
  readonly onDoubleClick: (event: ReactMouseEvent<SVGSVGElement>) => void;
  readonly commitText: (edit: SketchTextEdit, value: string) => void;
}

interface FrameGesture {
  readonly handle: FrameHandle;
  readonly start: SketchStroke;
  readonly pointerStart: SketchPoint;
  readonly gesture: number;
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

function distance(left: SketchPoint, right: SketchPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function sketchCursor(tool: SketchDrawingTool): string {
  if (tool === "eraser") return ERASER_CURSOR;
  if (tool === "rectangle") return "crosshair";
  if (tool === "text") return "text";
  return SKETCH_CURSOR;
}

/** The pointer state machine for the sketch surface: draw, erase, frame gestures and text editing. */
export function useSketchGestures(options: SketchGestureOptions): SketchGestures {
  const {
    open, hostElement, viewport, setViewport, tool, color, submitting, textEdit, setTextEdit,
    history, addStroke, eraseStrokes, transformStroke, selectTarget, svgRef,
  } = options;
  const [draftPoints, setDraftPoints] = useState<readonly SketchPoint[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverHandle, setHoverHandle] = useState<FrameHandle | null>(null);
  const [activeHandle, setActiveHandle] = useState<FrameHandle | null>(null);
  const targetRef = useRef(hostElement);
  const pointerId = useRef<number | null>(null);
  const draftPointsRef = useRef<readonly SketchPoint[]>([]);
  const draftPointLimitReached = useRef(false);
  const eraserPoint = useRef<SketchPoint | null>(null);
  // Identifies the current eraser drag so it undoes as a single edit.
  const eraseGesture = useRef(0);
  const frameGesture = useRef<FrameGesture | null>(null);
  const frameGestureCount = useRef(0);

  const strokes = history.strokes;
  const selected = tool === "eraser" || textEdit ? null : strokes.find((stroke) => stroke.id === selectedId) ?? null;
  const unit = viewport.width / Math.max(1, viewport.displayWidth);
  const frameHandle = activeHandle ?? hoverHandle;

  useEffect(() => {
    targetRef.current = hostElement;
  }, [hostElement]);

  useEffect(() => {
    if (!open) return;
    updateDraftPoints([]);
    // Closing mid-stroke unmounts the surface before its pointerup arrives.
    pointerId.current = null;
    eraserPoint.current = null;
    frameGesture.current = null;
    setSelectedId(null);
    setHoverHandle(null);
    setActiveHandle(null);
  // Choosing the first stroke's frame must preserve the stroke already in progress.
  }, [open]);

  function updateDraftPoints(next: readonly SketchPoint[]): void {
    draftPointsRef.current = next;
    setDraftPoints(next);
  }

  function eraseAlong(start: SketchPoint, end: SketchPoint, drawingViewport: SketchViewport): void {
    const radius = ERASER_RADIUS_PX * (drawingViewport.width / Math.max(1, drawingViewport.displayWidth));
    const gesture = eraseGesture.current;
    eraseStrokes(findErasedSketchStrokeIds(start, end, strokes, radius), gesture);
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
    const next = transformStrokeWithHandle(active.handle, active.start, active.pointerStart, point, viewportRegion(viewport), event.shiftKey);
    transformStroke(next, active.gesture);
  }

  function updateHoverHandle(event: ReactPointerEvent<SVGSVGElement>): void {
    const handle = selected && pointerId.current === null
      ? hitTestFrame(strokeFrame(selected), openPointFromEvent(event, viewport), unit)
      : null;
    setHoverHandle((current) => current === handle ? current : handle);
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    // The click finishes the open text edit (its blur commits); it must not start a stroke or a second text box.
    if (textEdit || submitting || pointerId.current !== null) return;
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
      const target = selectTarget({ x: event.clientX, y: event.clientY });
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

    // Drawing cancels the browser's focus change, so move focus here or undo
    // goes to the toolbar.
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
    const existing = findSketchElementAt(point, strokes);
    const layer = existing ? strokes.find((stroke) => stroke.id === existing && stroke.kind === "text") : undefined;
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
      color,
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
        eraseStrokes([edit.id], eraseGesture.current);
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
      const next = fitTextStroke(retypeTextStroke(current, text), viewportRegion(viewport));
      setSelectedId(current.id);
      if (!next) {
        showToast({ tone: "error", title: "Text not changed", description: TEXT_TOO_LONG });
        return;
      }
      transformStroke(next, frameGestureCount.current);
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
    addStroke(layer);
    setSelectedId(layer.id);
  }

  function onDoubleClick(event: ReactMouseEvent<SVGSVGElement>): void {
    if (submitting || textEdit) return;
    const point = openPointFromEvent(event, viewport);
    const hit = findSketchElementAt(point, strokes);
    if (hit && strokes.some((stroke) => stroke.id === hit && stroke.kind === "text")) {
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

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>): void {
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
      setSelectedId(findSketchElementAt(previous[0]!, strokes));
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
      color,
      points: points.map((point) => ({ ...point })),
    };
    addStroke(stroke);
    setSelectedId(stroke.id);
  }

  const cursor = selected && frameHandle
    ? frameHandleCursor(frameHandle, strokeFrame(selected), activeHandle !== null)
    : sketchCursor(tool);

  return {
    draftPoints,
    selected,
    cursor,
    onPointerDown,
    onPointerMove,
    onPointerLeave: () => setHoverHandle(null),
    onPointerUp,
    onDoubleClick,
    commitText,
  };
}
