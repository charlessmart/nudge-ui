import { useRef } from "react";
import type { ReactElement } from "react";
import { SketchSvgLayer } from "../../sketch/freehand.tsx";
import { useSketchViewport } from "../../sketch/useSketchViewport.ts";
import { useScrollTransform } from "../../sketch/useScrollTransform.ts";
import type { SketchStroke } from "../../sketch/model.ts";
import { getSketchMarks, showsPassiveMarks, sketchMarksMovable, useSketchMarksVersion } from "./marksStore.ts";
import { MovableMarks } from "./MovableMarks.tsx";
import { useSketchMarksKey } from "./sketchFrames.ts";
import { useBoardCamera } from "../viewStore.ts";

export interface SketchMarksProps {
  readonly cardId: string;
  readonly host: HTMLElement | null;
  /**
   * `card` fills the card's frame, which already follows the board's pan and zoom; `page` covers the inspected page
   * on the page surface, where there is no card around it.
   */
  readonly placement: "card" | "page";
}

/** A frame's marks while the sketch tool is not drawing on it. Only the marks themselves take a click, with the Select tool. */
export function SketchMarks({ cardId, host, placement }: SketchMarksProps): ReactElement | null {
  useSketchMarksVersion();
  const key = useSketchMarksKey(host, cardId);
  const strokes = key && showsPassiveMarks(key) ? getSketchMarks(key).strokes : [];
  if (!host || !key || strokes.length === 0) return null;
  return <FrameMarks markKey={key} host={host} strokes={strokes} placement={placement} />;
}

function FrameMarks({ markKey, host, strokes, placement }: {
  readonly markKey: string;
  readonly host: HTMLElement;
  readonly strokes: readonly SketchStroke[];
  readonly placement: SketchMarksProps["placement"];
}): ReactElement {
  // Board zoom rescales the frame without resizing it.
  const zoom = useBoardCamera().zoom;
  const { viewport } = useSketchViewport(host, true, String(zoom));
  const group = useRef<SVGGElement>(null);
  useScrollTransform(host, group);
  return (
    <div
      className="sketch-marks"
      data-placement={placement}
      style={placement === "page" ? { width: viewport.displayWidth, height: viewport.displayHeight } : undefined}
      aria-hidden="true"
      data-test="sketch-marks"
    >
      <svg
        className="sketch-marks__canvas"
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        preserveAspectRatio="none"
      >
        {/* Scrolled with the frame, so marks stay on the content they were drawn over. */}
        <g ref={group}>
          <SketchSvgLayer strokes={strokes} />
          {sketchMarksMovable() ? (
            <MovableMarks markKey={markKey} host={host} strokes={strokes} viewport={viewport} />
          ) : null}
        </g>
      </svg>
    </div>
  );
}
