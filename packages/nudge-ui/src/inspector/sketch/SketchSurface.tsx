import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  SKETCH_RECTANGLE_STROKE_WIDTH,
  SKETCH_STROKE_WIDTH,
  type SketchPoint,
  type SketchStroke,
  type SketchStrokeColor,
} from "./model.ts";
import type { SketchHistory } from "./history.ts";
import { shapePoints } from "./geometry.ts";
import { SketchSelectionFrame } from "./SketchSelectionFrame.tsx";
import { SketchSvgLayer } from "./freehand.tsx";
import { SketchTextEditor, type SketchTextEdit } from "./SketchTextEditor.tsx";
import { isSketchShapeTool, type SketchDrawingTool } from "./drawingTools.ts";
import { useSketchViewport } from "./useSketchViewport.ts";
import { useScrollTransform } from "./useScrollTransform.ts";
import { useSketchGestures } from "./useSketchGestures.ts";
import { forwardSketchWheel } from "./forwardWheel.ts";
import { portalContainer } from "../ui/portalContainer.ts";

export interface SketchSurfaceProps {
  readonly open: boolean;
  readonly hostElement: HTMLElement;
  readonly selectTarget?: (point: SketchPoint) => HTMLElement | null;
  readonly onCancel: () => void;
  readonly history: SketchHistory;
  readonly addStroke: (stroke: SketchStroke) => void;
  readonly eraseStrokes: (ids: readonly string[], gesture: number) => void;
  readonly transformStroke: (stroke: SketchStroke, gesture: number) => void;
  readonly textEdit: SketchTextEdit | null;
  readonly setTextEdit: (edit: SketchTextEdit | null) => void;
  readonly submitting: boolean;
  readonly tool: SketchDrawingTool;
  readonly color: SketchStrokeColor;
  readonly inspectorOpen: boolean;
  readonly temporaryAppInteraction: boolean;
  /** Changes when the board pans or zooms under the surface, so the frame is measured again. */
  readonly layoutKey?: string;
}

/** The drawing surface over the live frame. The session, toolbar and copy action live in `SketchWorkspace`. */
export function SketchSurface({
  open,
  hostElement,
  selectTarget,
  onCancel,
  history,
  addStroke,
  eraseStrokes,
  transformStroke,
  textEdit,
  setTextEdit,
  submitting,
  tool,
  color,
  inspectorOpen,
  temporaryAppInteraction,
  layoutKey,
}: SketchSurfaceProps): ReactElement | null {
  const { viewport, setViewport } = useSketchViewport(hostElement, open, layoutKey);
  const svgRef = useRef<SVGSVGElement>(null);
  const gestures = useSketchGestures({
    open,
    hostElement,
    viewport,
    setViewport,
    tool,
    color,
    submitting,
    textEdit,
    setTextEdit,
    history,
    addStroke,
    eraseStrokes,
    transformStroke,
    selectTarget,
    svgRef,
  });
  const unit = viewport.width / Math.max(1, viewport.displayWidth);
  const [popup, setPopup] = useState<HTMLElement | null>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const scrollGroup = useRef<SVGGElement>(null);
  const applyScroll = useScrollTransform(open ? hostElement : null, scrollGroup);
  // The layer being retyped is drawn by the editor instead.
  const editingId = textEdit?.id;
  const visibleStrokes = useMemo(
    () => editingId ? history.strokes.filter((stroke) => stroke.id !== editingId) : history.strokes,
    [editingId, history.strokes],
  );

  useEffect(() => {
    if (open) svgRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!popup) return;
    function onWheel(event: WheelEvent): void {
      // Pinch and ctrl-wheel zoom belong to the browser.
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      forwardSketchWheel(hostElement, viewportRef.current, event);
      // Moved in the same task as the scroll, so the marks paint in the same frame as the page.
      applyScroll();
    }
    popup.addEventListener("wheel", onWheel, { passive: false });
    return () => popup.removeEventListener("wheel", onWheel);
  }, [applyScroll, hostElement, popup]);

  if (!open) return null;

  const draftStroke: SketchStroke | null = gestures.draftPoints.length > 0 && tool !== "text" ? {
    id: "draft",
    kind: isSketchShapeTool(tool) ? tool : "freehand" as const,
    width: isSketchShapeTool(tool) ? SKETCH_RECTANGLE_STROKE_WIDTH : SKETCH_STROKE_WIDTH,
    color,
    points: (isSketchShapeTool(tool) && gestures.draftPoints.length > 1
      ? shapePoints(tool, gestures.draftPoints[0]!, gestures.draftPoints.at(-1)!)
      : gestures.draftPoints),
  } : null;

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
          ref={setPopup}
          style={{ visibility: temporaryAppInteraction ? "hidden" : undefined }}
          className="sketch__popup sketch__live-popup"
          data-test="sketch-live-editor"
        >
          <Dialog.Title className="sketch__title sketch__sr-only">Sketch viewport</Dialog.Title>
          <Dialog.Description className="sketch__description sketch__sr-only">
            Draw or type directly over the live interface. Marks stay until you clear them.
          </Dialog.Description>
          {selectTarget ? (
            <svg
              className="sketch__target-surface"
              aria-hidden="true"
              style={{ cursor: gestures.cursor }}
              onPointerDown={gestures.onPointerDown}
              onPointerMove={gestures.onPointerMove}
              onPointerLeave={gestures.onPointerLeave}
              onPointerUp={gestures.onPointerUp}
              onPointerCancel={gestures.onPointerUp}
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
              style={{ cursor: gestures.cursor }}
              tabIndex={0}
              aria-label="Sketch over the live interface"
              onPointerDown={gestures.onPointerDown}
              onPointerMove={gestures.onPointerMove}
              onPointerLeave={gestures.onPointerLeave}
              onPointerUp={gestures.onPointerUp}
              onPointerCancel={gestures.onPointerUp}
              onDoubleClick={gestures.onDoubleClick}
            >
              <g ref={scrollGroup}>
                <SketchSvgLayer strokes={visibleStrokes} />
                {draftStroke ? <SketchSvgLayer strokes={[draftStroke]} /> : null}
                {gestures.selected && !draftStroke ? <SketchSelectionFrame stroke={gestures.selected} unit={unit} /> : null}
              </g>
            </svg>
            {textEdit ? (
              <SketchTextEditor
                key={textEdit.id}
                edit={textEdit}
                viewport={viewport}
                unit={unit}
                onCommit={(value) => gestures.commitText(textEdit, value)}
                onCancel={() => setTextEdit(null)}
              />
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
