import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  IconArrowsMove,
  IconCheck,
  IconMessageCirclePlus,
  IconPencil,
  IconRectangle,
  IconX,
} from "@tabler/icons-react";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { StatusCallout } from "../ui/StatusCallout.tsx";
import { renderAnnotatedPng } from "./raster.ts";
import { SketchSvgLayer } from "./freehand.tsx";
import {
  findSketchElementAt,
  translateSketchAnnotation,
  translateSketchStroke,
  type SketchElementReference,
} from "./geometry.ts";
import {
  SKETCH_LIMITS,
  SKETCH_ANNOTATION_RADIUS,
  SKETCH_STROKE_COLOR,
  SKETCH_STROKE_OUTLINE,
  SKETCH_STROKE_WIDTH,
  type SketchAnnotation,
  type SketchDocument,
  type SketchStroke,
} from "./model.ts";
import type { CapturedSketch } from "./capture.ts";

type SketchTool = "move" | "pen" | "rectangle" | "annotate";

interface SketchMoveState {
  readonly pointerId: number;
  readonly element: SketchElementReference;
  lastPoint: { x: number; y: number };
}

export interface SketchEditorProps {
  readonly open: boolean;
  readonly document: SketchDocument | null;
  readonly captured: CapturedSketch | null;
  readonly onCancel: () => void;
  readonly onSave: (input: {
    readonly id?: string;
    readonly capture: SketchDocument["capture"];
    readonly description: string;
    readonly strokes: readonly SketchStroke[];
    readonly annotations?: readonly SketchAnnotation[];
    readonly imageWidth: number;
    readonly imageHeight: number;
    readonly originalImage: Blob;
    readonly annotatedImage: Blob;
  }) => Promise<void>;
}

function portalContainer(): HTMLElement | ShadowRoot | null {
  return typeof document !== "undefined"
    ? document.getElementById("nudge-ui-root")?.shadowRoot ?? document.body
    : null;
}

function objectUrl(blob: Blob | null): string | null {
  if (!blob || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  return URL.createObjectURL(blob);
}

function clamp(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, value));
}

function pointFromEvent(
  event: ReactPointerEvent<SVGSVGElement>,
  svg: SVGSVGElement,
  width: number,
  height: number,
): { x: number; y: number } {
  const bounds = svg.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - bounds.left) / Math.max(1, bounds.width)) * width, width),
    y: clamp(((event.clientY - bounds.top) / Math.max(1, bounds.height)) * height, height),
  };
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function rectanglePoints(start: { x: number; y: number }, end: { x: number; y: number }): { x: number; y: number }[] {
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

export function SketchEditor({ open, document: sketchDocument, captured, onCancel, onSave }: SketchEditorProps): ReactElement | null {
  const image = captured?.originalImage ?? sketchDocument?.originalImage ?? null;
  const imageWidth = captured?.imageWidth ?? sketchDocument?.imageWidth ?? 0;
  const imageHeight = captured?.imageHeight ?? sketchDocument?.imageHeight ?? 0;
  const capture = captured?.capture ?? sketchDocument?.capture ?? null;
  const [description, setDescription] = useState("");
  const [tool, setTool] = useState<SketchTool>("pen");
  const [strokes, setStrokes] = useState<SketchStroke[]>([]);
  const [redoStrokes, setRedoStrokes] = useState<SketchStroke[]>([]);
  const [annotations, setAnnotations] = useState<SketchAnnotation[]>([]);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [activeAnnotationOriginal, setActiveAnnotationOriginal] = useState<string | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [draftPoints, setDraftPoints] = useState<readonly { x: number; y: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageUrl = useMemo(() => objectUrl(image), [image]);
  const svgRef = useRef<SVGSVGElement>(null);
  const annotationInputRef = useRef<HTMLInputElement>(null);
  const pointerId = useRef<number | null>(null);
  const moveState = useRef<SketchMoveState | null>(null);
  const draftPointLimitReached = useRef(false);

  const activeAnnotation = annotations.find((annotation) => annotation.id === activeAnnotationId) ?? null;

  useEffect(() => {
    if (!open) return;
    setDescription(sketchDocument?.description ?? "");
    setTool("pen");
    setStrokes(sketchDocument ? sketchDocument.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) })) : []);
    setRedoStrokes([]);
    setAnnotations(sketchDocument?.annotations?.map((annotation) => ({
      ...annotation,
      point: { ...annotation.point },
    })) ?? []);
    setActiveAnnotationId(null);
    setActiveAnnotationOriginal(null);
    setAnnotationDraft("");
    setDraftPoints([]);
    moveState.current = null;
    setError(null);
    setSaving(false);
  }, [open, sketchDocument?.id, sketchDocument?.revision]);

  useEffect(() => {
    if (activeAnnotationId !== null) annotationInputRef.current?.focus();
  }, [activeAnnotationId]);

  useEffect(() => {
    if (open) svgRef.current?.focus();
  }, [open]);

  useEffect(() => {
    return () => {
      if (imageUrl && typeof URL !== "undefined") URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  function openAnnotation(annotation: SketchAnnotation): void {
    setActiveAnnotationId(annotation.id);
    setActiveAnnotationOriginal(annotation.description);
    setAnnotationDraft(annotation.description);
    setError(null);
  }

  function annotationAt(point: { x: number; y: number }): SketchAnnotation | null {
    return [...annotations].reverse().find((annotation) =>
      distance(annotation.point, point) <= SKETCH_ANNOTATION_RADIUS * 1.5) ?? null;
  }

  function commitActiveAnnotation(): SketchAnnotation[] | null {
    if (activeAnnotationId === null) return annotations;
    const nextDescription = annotationDraft.trim();
    if (!nextDescription) {
      setError("Add a short description for this annotation before continuing.");
      annotationInputRef.current?.focus();
      return null;
    }
    const next = annotations.map((annotation) => annotation.id === activeAnnotationId
      ? { ...annotation, description: nextDescription }
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

  function selectTool(nextTool: SketchTool): void {
    if (activeAnnotationId !== null && !commitActiveAnnotation()) return;
    setTool(nextTool);
    setError(null);
  }

  function annotationEditorStyle(annotation: SketchAnnotation): CSSProperties {
    const bounds = svgRef.current?.getBoundingClientRect();
    const scaleX = (bounds?.width ?? imageWidth) / Math.max(1, imageWidth);
    const scaleY = (bounds?.height ?? imageHeight) / Math.max(1, imageHeight);
    const width = 280;
    const height = 52;
    const availableWidth = bounds?.width ?? imageWidth;
    const availableHeight = bounds?.height ?? imageHeight;
    return {
      left: clamp(
        annotation.point.x * scaleX + SKETCH_ANNOTATION_RADIUS * scaleX + 8,
        Math.max(8, availableWidth - width - 8),
      ),
      top: clamp(
        annotation.point.y * scaleY + SKETCH_ANNOTATION_RADIUS * scaleY + 8,
        Math.max(8, availableHeight - height - 8),
      ),
    };
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    if (saving || !imageWidth || !imageHeight || pointerId.current !== null || moveState.current !== null) return;
    const point = pointFromEvent(event, event.currentTarget, imageWidth, imageHeight);

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
      const point = pointFromEvent(event, event.currentTarget, imageWidth, imageHeight);
      const delta = {
        x: point.x - activeMove.lastPoint.x,
        y: point.y - activeMove.lastPoint.y,
      };
      if (delta.x !== 0 || delta.y !== 0) {
        const bounds = { width: imageWidth, height: imageHeight };
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
    const point = pointFromEvent(event, event.currentTarget, imageWidth, imageHeight);
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

  async function save(): Promise<void> {
    if (!image || !capture || saving) return;
    const committedAnnotations = commitActiveAnnotation();
    if (committedAnnotations === null) return;
    if (strokes.length === 0 && committedAnnotations.length === 0 && description.trim() === "") {
      setError("Add a mark or a short description before saving the sketch.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const rendered = await renderAnnotatedPng(image, imageWidth, imageHeight, strokes, committedAnnotations);
      await onSave({
        ...(sketchDocument ? { id: sketchDocument.id } : {}),
        capture: {
          ...capture,
          imageWidth: rendered.width,
          imageHeight: rendered.height,
        },
        description: description.trim(),
        strokes,
        annotations: committedAnnotations,
        imageWidth: rendered.width,
        imageHeight: rendered.height,
        originalImage: image,
        annotatedImage: rendered.blob,
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The sketch could not be saved.");
      setSaving(false);
    }
  }

  const draftStroke: SketchStroke | null = draftPoints.length > 0
    ? {
      id: "draft",
      kind: tool === "rectangle" ? "rectangle" : "freehand",
      width: SKETCH_STROKE_WIDTH,
      color: SKETCH_STROKE_COLOR,
      outlineColor: SKETCH_STROKE_OUTLINE,
      points: tool === "rectangle" && draftPoints.length > 1
        ? rectanglePoints(draftPoints[0]!, draftPoints.at(-1)!)
        : draftPoints.map((point) => ({ ...point })),
    }
    : null;

  if (!open || !image || !capture) return null;

  return (
    <Dialog.Root
      open={open}
      modal={false}
      disablePointerDismissal
      onOpenChange={(nextOpen) => { if (!nextOpen && !saving) onCancel(); }}
    >
      <Dialog.Portal container={portalContainer()}>
        <Dialog.Backdrop className="sketch__backdrop sketch__editor-backdrop" data-test="sketch-editor-backdrop" />
        <Dialog.Popup className="sketch__popup" data-test="sketch-editor" initialFocus={false} onKeyDown={onEditorKeyDown}>
          <Dialog.Title className="sketch__title sketch__sr-only">Annotate viewport</Dialog.Title>
          <Dialog.Description className="sketch__description sketch__sr-only">
            Draw directly over the captured UI. Select Annotate to label an area with a numbered note.
          </Dialog.Description>
          <div className="sketch__canvas-frame">
            <div className="sketch__image-wrap">
              {imageUrl ? <img className="sketch__image" src={imageUrl} alt="Captured viewport" draggable={false} /> : null}
              <svg
                ref={svgRef}
                className={`sketch__canvas sketch__canvas--${tool}`}
                width={imageWidth}
                height={imageHeight}
                viewBox={`0 0 ${imageWidth} ${imageHeight}`}
                preserveAspectRatio="none"
                pointerEvents="all"
                tabIndex={0}
                aria-label="Sketch over the captured viewport"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={finishPointer}
                onPointerCancel={finishPointer}
              >
                <SketchSvgLayer
                  strokes={draftStroke ? [...strokes, draftStroke] : strokes}
                  annotations={annotations}
                />
              </svg>
              {activeAnnotation ? (
                <div
                  className="sketch__annotation-editor"
                  role="dialog"
                  aria-label={`Annotation ${activeAnnotation.number}`}
                  style={annotationEditorStyle(activeAnnotation)}
                >
                  <label className="sketch__sr-only" htmlFor="sketch-editor-annotation-description">
                    Annotation {activeAnnotation.number} description
                  </label>
                  <input
                    ref={annotationInputRef}
                    id="sketch-editor-annotation-description"
                    value={annotationDraft}
                    maxLength={SKETCH_LIMITS.description}
                    placeholder="Describe this area…"
                    autoComplete="off"
                    data-test="sketch-editor-annotation-description"
                    onChange={(event) => setAnnotationDraft(event.target.value)}
                    onKeyDown={onAnnotationKeyDown}
                  />
                  <IconButton
                    label="Cancel annotation"
                    variant="quiet"
                    size="compact"
                    data-test="sketch-editor-annotation-cancel"
                    onClick={cancelActiveAnnotation}
                  >
                    <IconX size="var(--icon-size-small)" aria-hidden="true" />
                  </IconButton>
                  <Button
                    variant="primary"
                    size="compact"
                    type="button"
                    data-test="sketch-editor-annotation-save"
                    onClick={() => { commitActiveAnnotation(); }}
                  >
                    <IconCheck size="var(--icon-size-small)" aria-hidden="true" />
                    Add
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="sketch__floating-panel">
            <div className="sketch__toolbar" role="toolbar" aria-label="Sketch tools">
              <IconButton
                label="Move"
                title="Move"
                variant="quiet"
                aria-pressed={tool === "move"}
                data-active={tool === "move"}
                data-test="sketch-move"
                onClick={() => selectTool("move")}
                disabled={saving}
              >
                <IconArrowsMove size="var(--icon-size-small)" aria-hidden="true" />
              </IconButton>
              <IconButton
                label="Pen"
                title="Pen"
                variant="quiet"
                aria-pressed={tool === "pen"}
                data-active={tool === "pen"}
                data-test="sketch-pen"
                onClick={() => selectTool("pen")}
                disabled={saving}
              >
                <IconPencil size="var(--icon-size-small)" aria-hidden="true" />
              </IconButton>
              <IconButton
                label="Rectangle"
                title="Rectangle"
                variant="quiet"
                aria-pressed={tool === "rectangle"}
                data-active={tool === "rectangle"}
                data-test="sketch-rectangle"
                onClick={() => selectTool("rectangle")}
                disabled={saving}
              >
                <IconRectangle size="var(--icon-size-small)" aria-hidden="true" />
              </IconButton>
              <IconButton
                label="Annotate"
                title="Annotate"
                variant="quiet"
                aria-pressed={tool === "annotate"}
                data-active={tool === "annotate"}
                data-test="sketch-annotate"
                onClick={() => selectTool("annotate")}
                disabled={saving}
              >
                <IconMessageCirclePlus size="var(--icon-size-small)" aria-hidden="true" />
              </IconButton>
              <span className="sketch__toolbar-divider" aria-hidden="true" />
              <Button
                variant="quiet"
                type="button"
                data-test="sketch-cancel"
                onClick={onCancel}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="button"
                data-test="sketch-done"
                onClick={() => void save()}
                disabled={saving || (strokes.length === 0 && annotations.length === 0 && description.trim() === "")}
              >
                <IconCheck size="var(--icon-size-small)" aria-hidden="true" />
                {saving ? "Saving…" : "Done"}
              </Button>
            </div>
            {error ? <StatusCallout tone="danger" data-test="sketch-editor-error">{error}</StatusCallout> : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
