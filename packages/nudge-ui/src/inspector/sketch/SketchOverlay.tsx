import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { getSketchViewport, type SketchViewport } from "./capture.ts";
import {
  SKETCH_ANNOTATION_RADIUS,
  SKETCH_LIMITS,
  SKETCH_STROKE_COLOR,
  SKETCH_STROKE_OUTLINE,
  SKETCH_STROKE_WIDTH,
  type SketchAnnotation,
  type SketchPoint,
  type SketchStroke,
} from "./model.ts";
import {
  findSketchElementAt,
  translateSketchAnnotation,
  translateSketchStroke,
  type SketchElementReference,
} from "./geometry.ts";
import type { SketchEntryTool } from "./interaction.ts";
import { SketchPromptPanel } from "./SketchPromptPanel.tsx";
import { SketchSvgLayer } from "./freehand.tsx";

type SketchTool = "move" | "pen" | "rectangle" | "annotate";

interface SketchMoveState {
  readonly pointerId: number;
  readonly element: SketchElementReference;
  lastPoint: SketchPoint;
}

export interface SketchLiveDraft {
  /** Kept for compatibility with sketches created with the original editor. */
  readonly description: string;
  readonly strokes: readonly SketchStroke[];
  readonly annotations: readonly SketchAnnotation[];
  readonly viewport: SketchViewport;
}

export interface SketchOverlayProps {
  readonly open: boolean;
  readonly hostElement: HTMLElement;
  readonly initialTool?: SketchEntryTool;
  readonly onCancel: () => void;
  readonly onDone: (draft: SketchLiveDraft) => Promise<void>;
}

function portalContainer(): HTMLElement | ShadowRoot | null {
  return typeof document !== "undefined"
    ? document.getElementById("nudge-ui-root")?.shadowRoot ?? document.body
    : null;
}

function clamp(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, value));
}

function pointFromEvent(
  event: ReactPointerEvent<SVGSVGElement>,
  canvas: SVGSVGElement,
  viewport: SketchViewport,
): SketchPoint {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - bounds.left) / Math.max(1, bounds.width)) * viewport.width, viewport.width) + viewport.scrollX,
    y: clamp(((event.clientY - bounds.top) / Math.max(1, bounds.height)) * viewport.height, viewport.height) + viewport.scrollY,
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

function visibleAnnotation(annotation: SketchAnnotation, viewport: SketchViewport): SketchAnnotation {
  return {
    ...annotation,
    point: {
      x: annotation.point.x - viewport.scrollX,
      y: annotation.point.y - viewport.scrollY,
    },
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

function annotationEditorStyle(
  annotation: SketchAnnotation,
  viewport: SketchViewport,
): CSSProperties {
  const width = 280;
  const height = 52;
  return {
    left: clamp(
      annotation.point.x - viewport.scrollX + SKETCH_ANNOTATION_RADIUS + 8,
      Math.max(8, viewport.width - width - 8),
    ),
    top: clamp(
      annotation.point.y - viewport.scrollY + SKETCH_ANNOTATION_RADIUS + 8,
      Math.max(8, viewport.height - height - 8),
    ),
  };
}

export function SketchOverlay({ open, hostElement, initialTool = "pen", onCancel, onDone }: SketchOverlayProps): ReactElement | null {
  const [viewport, setViewport] = useState<SketchViewport>(() => getSketchViewport(hostElement));
  const [tool, setTool] = useState<SketchTool>("pen");
  const [description, setDescription] = useState("");
  const [strokes, setStrokes] = useState<SketchStroke[]>([]);
  const [redoStrokes, setRedoStrokes] = useState<SketchStroke[]>([]);
  const [annotations, setAnnotations] = useState<SketchAnnotation[]>([]);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [activeAnnotationOriginal, setActiveAnnotationOriginal] = useState<string | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [draftPoints, setDraftPoints] = useState<readonly SketchPoint[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const annotationInputRef = useRef<HTMLInputElement>(null);
  const pointerId = useRef<number | null>(null);
  const moveState = useRef<SketchMoveState | null>(null);
  const draftPointLimitReached = useRef(false);

  const activeAnnotation = annotations.find((annotation) => annotation.id === activeAnnotationId) ?? null;

  useEffect(() => {
    if (!open) return;
    setViewport(getSketchViewport(hostElement));
    // Sketch starts with a freehand pen. The separate Annotate entry point
    // still opens directly in annotation mode without the old live toolbar.
    setTool(initialTool);
    setDescription("");
    setStrokes([]);
    setRedoStrokes([]);
    setAnnotations([]);
    setActiveAnnotationId(null);
    setActiveAnnotationOriginal(null);
    setAnnotationDraft("");
    setDraftPoints([]);
    moveState.current = null;
    setSubmitting(false);
    setError(null);
  }, [hostElement, initialTool, open]);

  useEffect(() => {
    if (!open) return;
    const updateViewport = (): void => setViewport(getSketchViewport(hostElement));
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
    if (activeAnnotationId !== null) annotationInputRef.current?.focus();
  }, [activeAnnotationId]);

  useEffect(() => {
    if (open) svgRef.current?.focus();
  }, [open]);

  function openAnnotation(annotation: SketchAnnotation): void {
    setActiveAnnotationId(annotation.id);
    setActiveAnnotationOriginal(annotation.description);
    setAnnotationDraft(annotation.description);
    setError(null);
  }

  function annotationAt(point: SketchPoint): SketchAnnotation | null {
    return [...annotations].reverse().find((annotation) =>
      distance(annotation.point, point) <= SKETCH_ANNOTATION_RADIUS * 1.5) ?? null;
  }

  function commitActiveAnnotation(): SketchAnnotation[] | null {
    if (activeAnnotationId === null) return annotations;
    const description = annotationDraft.trim();
    if (!description) {
      setError("Add a short description for this annotation before continuing.");
      annotationInputRef.current?.focus();
      return null;
    }
    const next = annotations.map((annotation) => annotation.id === activeAnnotationId
      ? { ...annotation, description }
      : annotation);
    setAnnotations(next);
    setActiveAnnotationId(null);
    setActiveAnnotationOriginal(null);
    setAnnotationDraft("");
    setError(null);
    return next;
  }

  function cancelActiveAnnotation(): void {
    if (activeAnnotationId !== null && activeAnnotationOriginal === "") {
      setAnnotations((current) => current.filter((annotation) => annotation.id !== activeAnnotationId));
    }
    setActiveAnnotationId(null);
    setActiveAnnotationOriginal(null);
    setAnnotationDraft("");
    setError(null);
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    if (submitting || pointerId.current !== null || moveState.current !== null) return;
    const point = pointFromEvent(event, event.currentTarget, viewport);

    if (tool === "move") {
      event.preventDefault();
      const element = findSketchElementAt(point, strokes, annotations);
      if (!element) return;
      moveState.current = { pointerId: event.pointerId, element, lastPoint: point };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (tool === "annotate") {
      event.preventDefault();
      if (activeAnnotationId !== null) {
        if (commitActiveAnnotation()) setError("Select Annotate again, then click another area.");
        return;
      }
      const existing = annotationAt(point);
      if (existing) {
        openAnnotation(existing);
        return;
      }
      if (annotations.length >= SKETCH_LIMITS.annotations) {
        setError(`A sketch can contain at most ${SKETCH_LIMITS.annotations} annotations.`);
        return;
      }
      const usedNumbers = new Set(annotations.map((annotation) => annotation.number));
      let nextNumber = 1;
      while (usedNumbers.has(nextNumber)) nextNumber += 1;
      const annotation: SketchAnnotation = {
        id: `annotation-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        number: nextNumber,
        point,
        description: "",
      };
      setAnnotations((current) => [...current, annotation]);
      setActiveAnnotationId(annotation.id);
      setActiveAnnotationOriginal("");
      setAnnotationDraft("");
      setError(null);
      return;
    }

    event.preventDefault();
    pointerId.current = event.pointerId;
    draftPointLimitReached.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraftPoints([point]);
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
    const activeMove = moveState.current;
    if (activeMove?.pointerId === event.pointerId) {
      event.preventDefault();
      const point = pointFromEvent(event, event.currentTarget, viewport);
      const delta = {
        x: point.x - activeMove.lastPoint.x,
        y: point.y - activeMove.lastPoint.y,
      };
      if (delta.x !== 0 || delta.y !== 0) {
        const bounds = { width: SKETCH_LIMITS.imageEdge, height: SKETCH_LIMITS.imageEdge };
        if (activeMove.element.kind === "stroke") {
          setStrokes((current) => current.map((stroke) => stroke.id === activeMove.element.id
            ? translateSketchStroke(stroke, delta, bounds)
            : stroke));
        } else {
          setAnnotations((current) => current.map((annotation) => annotation.id === activeMove.element.id
            ? translateSketchAnnotation(annotation, delta, bounds)
            : annotation));
        }
        activeMove.lastPoint = point;
      }
      return;
    }

    if (pointerId.current !== event.pointerId) return;
    event.preventDefault();
    const point = pointFromEvent(event, event.currentTarget, viewport);
    setDraftPoints((previous) => {
      const last = previous.at(-1);
      if (last && distance(last, point) < 1) return previous;
      if (previous.length >= SKETCH_LIMITS.points) {
        draftPointLimitReached.current = true;
        return previous;
      }
      return [...previous, point];
    });
  }

  function finishPointer(event: ReactPointerEvent<SVGSVGElement>): void {
    const activeMove = moveState.current;
    if (activeMove?.pointerId === event.pointerId) {
      moveState.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // The pointer may already have been released by the browser.
      }
      return;
    }

    if (pointerId.current !== event.pointerId) return;
    pointerId.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
    if (draftPointLimitReached.current) {
      draftPointLimitReached.current = false;
      setDraftPoints([]);
      setError(`A stroke can contain at most ${SKETCH_LIMITS.points.toLocaleString()} points. The incomplete stroke was discarded.`);
      return;
    }
    setDraftPoints((previous) => {
      if (previous.length === 0) return previous;
      const points = tool === "rectangle" && previous.length > 1
        ? rectanglePoints(previous[0]!, previous.at(-1)!)
        : previous;
      const totalPoints = strokes.reduce((total, stroke) => total + stroke.points.length, 0) + points.length;
      if (strokes.length >= SKETCH_LIMITS.strokes || totalPoints > SKETCH_LIMITS.points) {
        setError("The sketch has reached its stroke limit. Undo a mark before drawing again.");
        return [];
      }
      if (points.length < 2) return [];
      if (tool === "rectangle" && distance(previous[0]!, previous.at(-1)!) < 1) return [];
      const stroke: SketchStroke = {
        id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        kind: tool === "rectangle" ? "rectangle" : "freehand",
        width: SKETCH_STROKE_WIDTH,
        color: SKETCH_STROKE_COLOR,
        outlineColor: SKETCH_STROKE_OUTLINE,
        points: points.map((point) => ({ ...point })),
      };
      setStrokes((current) => [...current, stroke]);
      setRedoStrokes([]);
      return [];
    });
  }

  function undo(): void {
    setStrokes((current) => {
      const last = current.at(-1);
      if (!last) return current;
      setRedoStrokes((redo) => [...redo, last]);
      return current.slice(0, -1);
    });
  }

  function redo(): void {
    setRedoStrokes((current) => {
      const last = current.at(-1);
      if (!last) return current;
      setStrokes((existing) => [...existing, last]);
      return current.slice(0, -1);
    });
  }

  function onEditorKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) redo();
      else undo();
    } else if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      event.stopPropagation();
      redo();
    }
  }

  function onAnnotationKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      commitActiveAnnotation();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelActiveAnnotation();
    }
  }

  async function done(): Promise<void> {
    if (submitting) return;
    const committedAnnotations = commitActiveAnnotation();
    if (committedAnnotations === null) return;
    const trimmedDescription = description.trim();
    if (strokes.length === 0 && committedAnnotations.length === 0 && trimmedDescription === "") {
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
        annotations: committedAnnotations.map((annotation) => ({
          ...annotation,
          point: { ...annotation.point },
        })),
        viewport: getSketchViewport(hostElement),
      });
    } catch (doneError) {
      setError(doneError instanceof Error ? doneError.message : "The sketch could not be saved.");
      setSubmitting(false);
    }
  }

  const visibleStrokes = strokes.map((stroke) => visibleStroke(stroke, viewport));
  const visibleAnnotations = annotations.map((annotation) => visibleAnnotation(annotation, viewport));
  const draftStroke: SketchStroke | null = draftPoints.length > 0 ? {
    id: "draft",
    kind: tool === "rectangle" ? "rectangle" as const : "freehand" as const,
    width: SKETCH_STROKE_WIDTH,
    color: SKETCH_STROKE_COLOR,
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
        <Dialog.Backdrop className="sketch__backdrop sketch__live-backdrop" data-test="sketch-live-backdrop" />
        <Dialog.Popup className="sketch__popup sketch__live-popup" data-test="sketch-live-editor" onKeyDown={onEditorKeyDown}>
          <Dialog.Title className="sketch__title sketch__sr-only">Sketch viewport</Dialog.Title>
          <Dialog.Description className="sketch__description sketch__sr-only">
            Draw directly over the live interface, then add a short note for the sketch.
          </Dialog.Description>
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
              tabIndex={0}
              aria-label="Sketch over the live interface"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
            >
              <SketchSvgLayer
                strokes={draftStroke ? [...visibleStrokes, draftStroke] : visibleStrokes}
                annotations={visibleAnnotations}
              />
            </svg>
            {activeAnnotation ? (
              <div
                className="sketch__annotation-editor"
                role="dialog"
                aria-label={`Annotation ${activeAnnotation.number}`}
                style={annotationEditorStyle(activeAnnotation, viewport)}
              >
                <label className="sketch__sr-only" htmlFor="sketch-annotation-description">
                  Annotation {activeAnnotation.number} description
                </label>
                <input
                  ref={annotationInputRef}
                  id="sketch-annotation-description"
                  value={annotationDraft}
                  maxLength={SKETCH_LIMITS.description}
                  placeholder="Describe this area…"
                  autoComplete="off"
                  data-test="sketch-live-annotation-description"
                  onChange={(event) => setAnnotationDraft(event.target.value)}
                  onKeyDown={onAnnotationKeyDown}
                />
                <IconButton
                  label="Cancel annotation"
                  variant="quiet"
                  size="compact"
                  data-test="sketch-live-annotation-cancel"
                  onClick={cancelActiveAnnotation}
                >
                  <IconX size="var(--icon-size-small)" aria-hidden="true" />
                </IconButton>
                <Button
                  variant="primary"
                  size="compact"
                  type="button"
                  data-test="sketch-live-annotation-save"
                  onClick={() => { commitActiveAnnotation(); }}
                >
                  <IconCheck size="var(--icon-size-small)" aria-hidden="true" />
                  Add
                </Button>
              </div>
            ) : null}
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
