import { useEffect, useRef, useState } from "react";
import type {
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
  type SketchPoint,
  type SketchStroke,
} from "./model.ts";
import { findErasedSketchStrokeIds } from "./geometry.ts";
import {
  EMPTY_SKETCH_HISTORY,
  addSketchStroke,
  eraseSketchStrokes,
  redoSketchEdit,
  undoSketchEdit,
  type SketchHistory,
} from "./history.ts";
import { resetSketchDrawingTool, useSketchDrawingTools, type SketchDrawingTool } from "./drawingTools.ts";
import { SketchPromptPanel } from "./SketchPromptPanel.tsx";
import { SketchSvgLayer } from "./freehand.tsx";
import { useInspectorOpen } from "../shell/openStore.ts";
import { isEditableEvent } from "../shell/shortcuts.ts";
import { ERASER_CURSOR, SKETCH_CURSOR } from "../ui/customCursors.ts";
import { useTemporaryAppInteraction } from "../canvas/viewStore.ts";
import { portalContainer } from "../ui/portalContainer.ts";

/** Eraser reach around the pointer in screen pixels, matching the cursor ring. */
const ERASER_RADIUS_PX = 8;

function sketchCursor(tool: SketchDrawingTool): string {
  if (tool === "eraser") return ERASER_CURSOR;
  if (tool === "rectangle") return "crosshair";
  return SKETCH_CURSOR;
}

export interface SketchLiveDraft {
  /** Kept for compatibility with sketches created with the original editor. */
  readonly description: string;
  readonly strokes: readonly SketchStroke[];
  readonly viewport: SketchViewport;
}

export interface SketchOverlayProps {
  readonly open: boolean;
  readonly hostElement: HTMLElement;
  readonly selectTarget?: (point: SketchPoint, lockedTarget: HTMLElement | null) => HTMLElement | null;
  readonly onCancel: () => void;
  readonly onDone: (draft: SketchLiveDraft) => Promise<void>;
}

function clamp(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, value));
}

function pointFromEvent(
  event: ReactPointerEvent<SVGSVGElement>,
  viewport: SketchViewport,
): SketchPoint {
  return {
    x: clamp(((event.clientX - viewport.offsetX) / Math.max(1, viewport.displayWidth)) * viewport.width, viewport.width) + viewport.scrollX,
    y: clamp(((event.clientY - viewport.offsetY) / Math.max(1, viewport.displayHeight)) * viewport.height, viewport.height) + viewport.scrollY,
  };
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
  const [description, setDescription] = useState("");
  const [history, setHistory] = useState<SketchHistory>(EMPTY_SKETCH_HISTORY);
  const [draftPoints, setDraftPoints] = useState<readonly SketchPoint[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const targetRef = useRef(hostElement);
  const pointerId = useRef<number | null>(null);
  const draftPointsRef = useRef<readonly SketchPoint[]>([]);
  const draftPointLimitReached = useRef(false);
  const eraserPoint = useRef<SketchPoint | null>(null);
  // Identifies the current eraser drag so it undoes as a single edit.
  const eraseGesture = useRef(0);

  const strokes = history.strokes;

  function updateDraftPoints(next: readonly SketchPoint[]): void {
    draftPointsRef.current = next;
    setDraftPoints(next);
  }

  useEffect(() => {
    if (!open) return;
    targetRef.current = hostElement;
    setViewport(getSketchViewport(hostElement));
    resetSketchDrawingTool();
    setDescription("");
    setHistory(EMPTY_SKETCH_HISTORY);
    updateDraftPoints([]);
    // Closing mid-stroke unmounts the surface before its pointerup arrives.
    pointerId.current = null;
    eraserPoint.current = null;
    setSubmitting(false);
    setError(null);
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

  // Listen on the window rather than the dialog: the drawing options live in
  // the canvas toolbar, so focus is often outside the dialog while sketching.
  // Text fields keep their native undo.
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

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    if (submitting || pointerId.current !== null) return;
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

    // Drawing cancels the browser's focus change, so move focus here
    // explicitly; otherwise undo keeps going to the note or a toolbar button.
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
    updateDraftPoints([point]);
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
    if (pointerId.current !== event.pointerId) return;
    event.preventDefault();
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
    if (eraserPoint.current) {
      eraserPoint.current = null;
      return;
    }
    const previous = draftPointsRef.current;
    updateDraftPoints([]);
    if (draftPointLimitReached.current) {
      draftPointLimitReached.current = false;
      setError(`A stroke can contain at most ${SKETCH_LIMITS.points.toLocaleString()} points. The incomplete stroke was discarded.`);
      return;
    }
    if (previous.length === 0) return;
    const points = tool === "rectangle" && previous.length > 1
      ? rectanglePoints(previous[0]!, previous.at(-1)!)
      : previous;
    const totalPoints = strokes.reduce((total, stroke) => total + stroke.points.length, 0) + points.length;
    if (strokes.length >= SKETCH_LIMITS.strokes || totalPoints > SKETCH_LIMITS.points) {
      setError("The sketch has reached its stroke limit. Erase a mark before drawing again.");
      return;
    }
    if (points.length < 2) return;
    if (tool === "rectangle" && distance(previous[0]!, previous.at(-1)!) < 1) return;
    const stroke: SketchStroke = {
      id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      kind: tool === "rectangle" ? "rectangle" : "freehand",
      width: tool === "rectangle" ? SKETCH_RECTANGLE_STROKE_WIDTH : SKETCH_STROKE_WIDTH,
      color: drawing.color.value,
      outlineColor: SKETCH_STROKE_OUTLINE,
      points: points.map((point) => ({ ...point })),
    };
    setHistory((current) => addSketchStroke(current, stroke));
  }

  async function done(): Promise<void> {
    if (submitting) return;
    const trimmedDescription = description.trim();
    if (strokes.length === 0 && trimmedDescription === "") {
      setError("Add a mark or a short description before saving the sketch.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onDone({
        description: trimmedDescription,
        strokes: strokes.map((stroke) => ({
          ...stroke,
          points: stroke.points.map((point) => ({ ...point })),
        })),
        viewport: getSketchViewport(hostElement),
      });
    } catch (doneError) {
      setError(doneError instanceof Error ? doneError.message : "The sketch could not be saved.");
      setSubmitting(false);
    }
  }

  const visibleStrokes = strokes.map((stroke) => visibleStroke(stroke, viewport));
  const draftStroke: SketchStroke | null = draftPoints.length > 0 ? {
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
      onOpenChange={(nextOpen) => { if (!nextOpen && !submitting) onCancel(); }}
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
            Draw directly over the live interface, then add a short note for the sketch.
          </Dialog.Description>
          {selectTarget ? (
            <svg
              className="sketch__target-surface"
              aria-hidden="true"
              style={{ cursor: sketchCursor(tool) }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
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
              style={{ cursor: sketchCursor(tool) }}
              tabIndex={0}
              aria-label="Sketch over the live interface"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
            >
              <SketchSvgLayer strokes={draftStroke ? [...visibleStrokes, draftStroke] : visibleStrokes} />
            </svg>
          </div>
          <SketchPromptPanel
            dataTest="sketch-live-prompt"
            className="sketch__live-note-panel"
            description={description}
            error={error}
            saving={submitting}
            autoFocus
            onDescriptionChange={setDescription}
            onDone={done}
            onCancel={onCancel}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
