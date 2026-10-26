import type { ReactElement } from "react";
import { SKETCH_ACCENT_COLOR, type SketchStroke } from "./model.ts";
import { FRAME_HANDLE_SIZE_PX, frameGeometry, strokeFrame } from "./selectionFrame.ts";

export interface SketchSelectionFrameProps {
  readonly stroke: Pick<SketchStroke, "points" | "width" | "rotation">;
  /** Drawing units per screen pixel, so borders and handles keep a constant on-screen size. */
  readonly unit: number;
}

/** Border, corner squares, and a rotation line with its own square; hit-testing lives in `selectionFrame.ts`. */
export function SketchSelectionFrame({ stroke, unit }: SketchSelectionFrameProps): ReactElement {
  const frame = strokeFrame(stroke);
  const { halfWidth, halfHeight, rotateY } = frameGeometry(frame, unit);
  const handle = FRAME_HANDLE_SIZE_PX * unit;
  const handleProps = {
    width: handle,
    height: handle,
    fill: "#ffffff",
    stroke: SKETCH_ACCENT_COLOR,
    strokeWidth: unit,
  };

  return (
    <g
      data-test="sketch-selection-frame"
      transform={`translate(${frame.center.x} ${frame.center.y}) rotate(${(frame.rotation * 180) / Math.PI})`}
      pointerEvents="none"
    >
      <rect
        x={-halfWidth}
        y={-halfHeight}
        width={halfWidth * 2}
        height={halfHeight * 2}
        fill="none"
        stroke={SKETCH_ACCENT_COLOR}
        strokeWidth={unit}
      />
      <line x1={0} y1={-halfHeight} x2={0} y2={rotateY} stroke={SKETCH_ACCENT_COLOR} strokeWidth={unit} />
      {[-1, 1].flatMap((x) => [-1, 1].map((y) => (
        <rect
          key={`${x}${y}`}
          x={x * halfWidth - handle / 2}
          y={y * halfHeight - handle / 2}
          data-test="sketch-selection-corner"
          {...handleProps}
        />
      )))}
      <rect x={-handle / 2} y={rotateY - handle / 2} data-test="sketch-selection-rotate" {...handleProps} />
    </g>
  );
}
