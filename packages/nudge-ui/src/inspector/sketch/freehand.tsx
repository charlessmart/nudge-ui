import { getStroke } from "perfect-freehand";
import type { ReactElement } from "react";
import {
  SKETCH_STROKE_COLOR,
  type SketchAnnotation,
  type SketchPoint,
  type SketchStroke,
} from "./model.ts";

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
  if (stroke.points.length === 0 || stroke.kind === "rectangle") return [];
  const size = stroke.width * Math.max(scaleX, scaleY);
  return getStroke(
    stroke.points.map((point) => [point.x * scaleX, point.y * scaleY]),
    { ...FREEHAND_OPTIONS, size },
  ) as readonly Vec2[];
}

export function sketchStrokePath(stroke: Pick<SketchStroke, "kind" | "points" | "width">, scaleX = 1, scaleY = scaleX): string {
  if (stroke.points.length === 0) return "";
  if (stroke.kind === "rectangle") return linePath(stroke.points, scaleX, scaleY);
  return getSvgPathFromStroke(sketchStrokeOutline(stroke, scaleX, scaleY));
}

export interface SketchSvgLayerProps {
  readonly strokes: readonly SketchStroke[];
  readonly annotations?: readonly SketchAnnotation[];
  readonly annotationScale?: number;
}

/** Renders sketch geometry as DOM-native SVG shapes. */
export function SketchSvgLayer({
  strokes,
  annotations = [],
  annotationScale = 1,
}: SketchSvgLayerProps): ReactElement {
  return (
    <g data-test="sketch-svg-layer">
      {strokes.map((stroke) => {
        const path = sketchStrokePath(stroke);
        if (!path) return null;
        const rectangle = stroke.kind === "rectangle";
        return (
          <path
            key={stroke.id}
            d={path}
            fill={rectangle ? "none" : stroke.color || SKETCH_STROKE_COLOR}
            stroke={rectangle ? stroke.color || SKETCH_STROKE_COLOR : "none"}
            strokeWidth={rectangle ? stroke.width : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        );
      })}
      {annotations.map((annotation) => {
        const radius = 16 * annotationScale;
        return (
          <g key={annotation.id} transform={`translate(${number(annotation.point.x)} ${number(annotation.point.y)})`} pointerEvents="none">
            <circle r={radius} fill={SKETCH_STROKE_COLOR} />
            <text
              x="0"
              y="0"
              fill="#ffffff"
              fontFamily="system-ui, sans-serif"
              fontSize={12 * annotationScale}
              fontWeight="600"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {annotation.number}
            </text>
          </g>
        );
      })}
    </g>
  );
}
