import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactElement } from "react";
import { sketchHitPath } from "../../sketch/freehand.tsx";
import { sketchHitTolerance } from "../../sketch/geometry.ts";
import { SketchSelectionFrame } from "../../sketch/SketchSelectionFrame.tsx";
import {
  FRAME_CORNERS,
  FRAME_EDGE_HIT_PX,
  FRAME_HANDLE_HIT_PX,
  FRAME_ROTATE_HIT_PX,
  frameCorner,
  frameGeometry,
  frameHandleCursor,
  hitTestFrame,
  strokeFrame,
  transformStrokeWithHandle,
  type FrameHandle,
} from "../../sketch/selectionFrame.ts";
import { textLayout } from "../../sketch/text.ts";
import { getSketchViewport, openPointFromEvent, sketchUnit, viewportRegion, type SketchViewport } from "../../sketch/viewport.ts";
import type { SketchPoint, SketchStroke } from "../../sketch/model.ts";
import { isEditableEvent } from "../../shell/shortcuts.ts";
import { setSelectedElement, useSelectedElement } from "../../selection/selectionStore.ts";
import {
  deleteSelectedSketchMark,
  nextMarkGesture,
  redoSketchMarks,
  selectSketchMark,
  transformSketchMark,
  undoSketchMarks,
  useSelectedSketchMark,
} from "./marksStore.ts";
import { sketchHistoryActionForEvent } from "./sketchShortcuts.ts";

/** A press on anything without it puts the picked-up mark down. */
const HIT_ATTRIBUTE = "data-sketch-mark-hit";

export interface MovableMarksProps {
  readonly markKey: string;
  readonly host: HTMLElement;
  readonly strokes: readonly SketchStroke[];
  readonly viewport: SketchViewport;
}

interface Drag {
  readonly key: string;
  readonly pointerId: number;
  readonly handle: FrameHandle;
  readonly start: SketchStroke;
  /** Measured once at the press; the board cannot pan while the pointer is captured. */
  readonly viewport: SketchViewport;
  readonly pointerStart: SketchPoint;
  readonly gesture: number;
}

function hitsMark(event: Event): boolean {
  return event.composedPath().some((node) => node instanceof Element && node.hasAttribute(HIT_ATTRIBUTE));
}

/** Focus inside a frame keeps keys away from this window, so pressing a mark takes it back. */
function releaseFrameFocus(): void {
  let active: Element | null = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  if (active instanceof HTMLIFrameElement) active.blur();
}

/** Losing focus puts the mark down too, since a press inside a frame never reaches this window. */
export function useMarkSelection(): void {
  const picked = useSelectedSketchMark();
  const selectedElement = useSelectedElement();
  useEffect(() => {
    if (selectedElement) selectSketchMark(null);
  }, [selectedElement]);

  const key = picked?.key ?? null;
  useEffect(() => {
    if (!key) return;
    const markKey = key;
    function putDown(): void {
      selectSketchMark(null);
    }
    function onPointerDown(event: PointerEvent): void {
      if (!hitsMark(event)) putDown();
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented) return;
      const action = sketchHistoryActionForEvent(event);
      const plain = !(event.metaKey || event.ctrlKey || event.altKey || isEditableEvent(event));
      const deletes = plain && (event.key === "Delete" || event.key === "Backspace");
      if (action === "undo") undoSketchMarks(markKey);
      else if (action === "redo") redoSketchMarks(markKey);
      else if (plain && event.key === "Escape") putDown();
      else if (!(deletes && deleteSelectedSketchMark())) return;
      event.preventDefault();
      event.stopPropagation();
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", putDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", putDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [key]);
}

/** Pointer-only, like the sketch itself. Presses that miss a mark or its frame reach the page. */
export function MovableMarks({ markKey, host, strokes, viewport }: MovableMarksProps): ReactElement {
  const [dragging, setDragging] = useState<FrameHandle | null>(null);
  const drag = useRef<Drag | null>(null);
  const picked = useSelectedSketchMark();
  const selected = picked?.key === markKey ? strokes.find((stroke) => stroke.id === picked.id) ?? null : null;
  const unit = sketchUnit(viewport);

  function begin(event: ReactPointerEvent<SVGElement>, stroke: SketchStroke, onFrame: boolean): void {
    if (event.button !== 0 || drag.current) return;
    // The press is the mark's: no element selection, no board pan, no focus change.
    event.preventDefault();
    event.stopPropagation();
    releaseFrameFocus();
    setSelectedElement(null);
    selectSketchMark({ key: markKey, id: stroke.id });
    const live = getSketchViewport(host);
    const pointerStart = openPointFromEvent(event, live);
    const handle = onFrame ? hitTestFrame(strokeFrame(stroke), pointerStart, sketchUnit(live)) ?? "move" : "move";
    drag.current = { key: markKey, pointerId: event.pointerId, handle, start: stroke, viewport: live, pointerStart, gesture: nextMarkGesture() };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(handle);
  }

  function move(event: ReactPointerEvent<SVGElement>): void {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = openPointFromEvent(event, active.viewport);
    const next = transformStrokeWithHandle(active.handle, active.start, active.pointerStart, point, viewportRegion(active.viewport), event.shiftKey);
    transformSketchMark(active.key, next, active.gesture);
  }

  function end(event: ReactPointerEvent<SVGElement>): void {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may already have released it.
    }
  }

  const pointerHandlers = { onPointerMove: move, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end };

  return (
    <g data-test="sketch-marks-movable">
      {strokes.map((stroke) => (
        <MarkHit
          key={stroke.id}
          stroke={stroke}
          cursor={dragging === "move" ? "grabbing" : "grab"}
          onPointerDown={(event) => begin(event, stroke, false)}
          {...pointerHandlers}
        />
      ))}
      {selected ? (
        <>
          <SketchSelectionFrame stroke={selected} unit={unit} />
          <FrameHits
            stroke={selected}
            unit={unit}
            dragging={dragging}
            onPointerDown={(event) => begin(event, selected, true)}
            {...pointerHandlers}
          />
        </>
      ) : null}
    </g>
  );
}

type PointerHandler = (event: ReactPointerEvent<SVGElement>) => void;

interface PointerHandlers {
  readonly onPointerDown: PointerHandler;
  readonly onPointerMove: PointerHandler;
  readonly onPointerUp: PointerHandler;
  readonly onPointerCancel: PointerHandler;
  readonly onLostPointerCapture: PointerHandler;
}

/** An invisible copy of the mark's line, widened to the sketch surface's reach. */
function MarkHit({ stroke, cursor, ...handlers }: PointerHandlers & {
  readonly stroke: SketchStroke;
  readonly cursor: string;
}): ReactElement | null {
  const reach = sketchHitTolerance(stroke);
  const common = {
    [HIT_ATTRIBUTE]: "",
    "data-test": "sketch-mark-hit",
    "data-stroke-id": stroke.id,
    style: { cursor },
    ...handlers,
  };
  if (stroke.kind === "text") {
    const { frame } = textLayout(stroke);
    return (
      <rect
        x={-frame.width / 2 - reach}
        y={-frame.height / 2 - reach}
        width={frame.width + reach * 2}
        height={frame.height + reach * 2}
        transform={`translate(${frame.center.x} ${frame.center.y}) rotate(${(frame.rotation * 180) / Math.PI})`}
        fill="transparent"
        pointerEvents="all"
        {...common}
      />
    );
  }
  const path = sketchHitPath(stroke);
  if (!path) return null;
  return (
    <path
      d={path}
      fill="none"
      stroke="transparent"
      strokeWidth={reach * 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="stroke"
      {...common}
    />
  );
}

/** Drawn to the reach `hitTestFrame` allows, which then decides the handle. */
function FrameHits({ stroke, unit, dragging, ...handlers }: PointerHandlers & {
  readonly stroke: SketchStroke;
  readonly unit: number;
  readonly dragging: FrameHandle | null;
}): ReactElement {
  const frame = strokeFrame(stroke);
  const { halfWidth, halfHeight, rotateY } = frameGeometry(frame, unit);
  const grab = { cursor: frameHandleCursor("move", frame, dragging === "move" || dragging === "rotate") };
  const common = { [HIT_ATTRIBUTE]: "", stroke: "transparent", ...handlers };
  return (
    <g>
      <g transform={`translate(${frame.center.x} ${frame.center.y}) rotate(${(frame.rotation * 180) / Math.PI})`}>
        <rect
          x={-halfWidth}
          y={-halfHeight}
          width={halfWidth * 2}
          height={halfHeight * 2}
          fill="none"
          strokeWidth={FRAME_EDGE_HIT_PX * 2 * unit}
          pointerEvents="stroke"
          style={grab}
          {...common}
        />
        <line
          x1={0}
          y1={-halfHeight}
          x2={0}
          y2={rotateY}
          strokeWidth={FRAME_ROTATE_HIT_PX * 2 * unit}
          strokeLinecap="round"
          pointerEvents="stroke"
          style={grab}
          {...common}
        />
      </g>
      {FRAME_CORNERS.map((corner) => {
        const position = frameCorner(frame, corner);
        return (
          <circle
            key={corner}
            cx={position.x}
            cy={position.y}
            r={FRAME_HANDLE_HIT_PX * unit}
            fill="transparent"
            pointerEvents="all"
            style={{ cursor: frameHandleCursor(corner, frame, dragging === corner) }}
            {...common}
          />
        );
      })}
    </g>
  );
}
