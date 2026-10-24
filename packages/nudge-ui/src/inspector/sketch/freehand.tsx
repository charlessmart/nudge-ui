import { getStroke } from "perfect-freehand";
import type { ReactElement } from "react";
import {
  SKETCH_RECTANGLE_FILL_OPACITY,
  SKETCH_STROKE_COLOR,
  SKETCH_TEXT_FONT_FAMILY,
  SKETCH_TEXT_FONT_SIZE,
  SKETCH_TEXT_FONT_WEIGHT,
  type SketchPoint,
  type SketchStroke,
} from "./model.ts";
import { textLayout } from "./text.ts";

export type Vec2 = readonly [number, number];

const FREEHAND_OPTIONS = {
  thinning: 0.45,
  smoothing: 0.5,
  streamline: 0.35,
  simulatePressure: true,
  last: true,
} as const;

function number(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0";
}

function linePath(points: readonly SketchPoint[], scaleX: number, scaleY: number): string {
  const first = points[0];
  if (!first) return "";
  const commands = [`M ${number(first.x * scaleX)} ${number(first.y * scaleY)}`];
  for (const point of points.slice(1)) {
    commands.push(`L ${number(point.x * scaleX)} ${number(point.y * scaleY)}`);
  }
  return commands.join(" ");
}

export function getSvgPathFromStroke(points: readonly Vec2[], closed = true): string {
  if (points.length < 4) return "";
  const average = (left: number, right: number): number => (left + right) / 2;
  const first = points[0]!;
  const second = points[1]!;
  const third = points[2]!;
  let result = `M ${number(first[0])} ${number(first[1])} Q ${number(second[0])} ${number(second[1])} ${number(average(second[0], third[0]))} ${number(average(second[1], third[1]))} T`;
  for (let index = 2; index < points.length - 1; index += 1) {
    const current = points[index]!;
    const next = points[index + 1]!;
    result += ` ${number(average(current[0], next[0]))} ${number(average(current[1], next[1]))}`;
  }
  return closed ? `${result} Z` : result;
}

export function sketchStrokeOutline(
  stroke: Pick<SketchStroke, "kind" | "points" | "width">,
  scaleX = 1,
  scaleY = scaleX,
): readonly Vec2[] {
  if (stroke.points.length === 0 || stroke.kind === "rectangle" || stroke.kind === "text") return [];
  const size = stroke.width * Math.max(scaleX, scaleY);
  return getStroke(
    stroke.points.map((point) => [point.x * scaleX, point.y * scaleY]),
    { ...FREEHAND_OPTIONS, size },
  ) as readonly Vec2[];
}

export function sketchStrokePath(stroke: Pick<SketchStroke, "kind" | "points" | "width">, scaleX = 1, scaleY = scaleX): string {
  if (stroke.points.length === 0 || stroke.kind === "text") return "";
  if (stroke.kind === "rectangle") return linePath(stroke.points, scaleX, scaleY);
  return getSvgPathFromStroke(sketchStrokeOutline(stroke, scaleX, scaleY));
}

/** Lines are spaced to fill the layer's box, so a resized or projected box keeps its text inside it. */
function SketchTextElement({ stroke }: { readonly stroke: SketchStroke }): ReactElement {
  const { frame, lines, lineHeight } = textLayout(stroke);
  return (
    <text
      transform={`translate(${number(frame.center.x)} ${number(frame.center.y)}) rotate(${number((frame.rotation * 180) / Math.PI)})`}
      fill={stroke.color || SKETCH_STROKE_COLOR}
      fontFamily={SKETCH_TEXT_FONT_FAMILY}
      fontSize={stroke.fontSize ?? SKETCH_TEXT_FONT_SIZE}
      fontWeight={SKETCH_TEXT_FONT_WEIGHT}
      dominantBaseline="central"
      style={{ whiteSpace: "pre" }}
      pointerEvents="none"
      data-test="sketch-text-layer"
    >
      {lines.map((line, index) => (
        <tspan key={index} x={number(-frame.width / 2)} y={number(-frame.height / 2 + (index + 0.5) * lineHeight)}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export interface SketchSvgLayerProps {
  readonly strokes: readonly SketchStroke[];
}

export function SketchSvgLayer({ strokes }: SketchSvgLayerProps): ReactElement {
  return (
    <g data-test="sketch-svg-layer">
      {strokes.map((stroke) => {
        if (stroke.kind === "text") return <SketchTextElement key={stroke.id} stroke={stroke} />;
        const path = sketchStrokePath(stroke);
        if (!path) return null;
        const rectangle = stroke.kind === "rectangle";
        return (
          <path
            key={stroke.id}
            d={path}
            fill={stroke.color || SKETCH_STROKE_COLOR}
            fillOpacity={rectangle ? SKETCH_RECTANGLE_FILL_OPACITY : undefined}
            stroke={rectangle ? stroke.color || SKETCH_STROKE_COLOR : "none"}
            strokeWidth={rectangle ? stroke.width : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        );
      })}
    </g>
  );
}
