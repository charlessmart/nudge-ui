import { getStroke } from "perfect-freehand";
import { memo, useId } from "react";
import type { ReactElement } from "react";
import {
  isSketchShapeKind,
  SKETCH_RECTANGLE_FILL_OPACITY,
  SKETCH_STROKE_COLOR,
  SKETCH_TEXT_FONT_FAMILY,
  SKETCH_TEXT_FONT_SIZE,
  SKETCH_TEXT_FONT_WEIGHT,
  type SketchPoint,
  type SketchStroke,
} from "./model.ts";
import { strokeFrame } from "./selectionFrame.ts";
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

/** The arrowhead's two barbs spread this far to either side of the shaft, and are this many line widths long unless the shaft is short. */
const ARROWHEAD_SPREAD = Math.PI / 6.5;
const ARROWHEAD_LENGTH_IN_WIDTHS = 4.5;

/** A shaft from the tail to the head, then the two barbs that make the head. */
function arrowPath(points: readonly SketchPoint[], width: number, scaleX: number, scaleY: number): string {
  const tail = points[0];
  const head = points[1];
  if (!tail || !head) return linePath(points, scaleX, scaleY);
  const [tailX, tailY, headX, headY] = [tail.x * scaleX, tail.y * scaleY, head.x * scaleX, head.y * scaleY];
  const length = Math.hypot(headX - tailX, headY - tailY);
  const angle = Math.atan2(tailY - headY, tailX - headX);
  const barb = Math.min(width * Math.max(scaleX, scaleY) * ARROWHEAD_LENGTH_IN_WIDTHS, length * 0.6);
  const left = [headX + barb * Math.cos(angle + ARROWHEAD_SPREAD), headY + barb * Math.sin(angle + ARROWHEAD_SPREAD)];
  const right = [headX + barb * Math.cos(angle - ARROWHEAD_SPREAD), headY + barb * Math.sin(angle - ARROWHEAD_SPREAD)];
  return `M ${number(tailX)} ${number(tailY)} L ${number(headX)} ${number(headY)} M ${number(left[0]!)} ${number(left[1]!)} L ${number(headX)} ${number(headY)} L ${number(right[0]!)} ${number(right[1]!)}`;
}

/** The ellipse inscribed in the stroke's (possibly rotated) box, as two half arcs. */
function ellipsePath(stroke: Pick<SketchStroke, "points" | "width" | "rotation">, scaleX: number, scaleY: number): string {
  const frame = strokeFrame(stroke);
  const radiusX = (frame.width / 2) * scaleX;
  const radiusY = (frame.height / 2) * scaleY;
  const centerX = frame.center.x * scaleX;
  const centerY = frame.center.y * scaleY;
  const cos = Math.cos(frame.rotation);
  const sin = Math.sin(frame.rotation);
  const degrees = number((frame.rotation * 180) / Math.PI);
  const arc = `A ${number(radiusX)} ${number(radiusY)} ${degrees} 1 0`;
  const start = `${number(centerX - radiusX * cos)} ${number(centerY - radiusX * sin)}`;
  const end = `${number(centerX + radiusX * cos)} ${number(centerY + radiusX * sin)}`;
  return `M ${start} ${arc} ${end} ${arc} ${start} Z`;
}

export function sketchStrokeOutline(
  stroke: Pick<SketchStroke, "kind" | "points" | "width">,
  scaleX = 1,
  scaleY = scaleX,
): readonly Vec2[] {
  if (stroke.points.length === 0 || stroke.kind === "text" || isSketchShapeKind(stroke.kind)) return [];
  const size = stroke.width * Math.max(scaleX, scaleY);
  return getStroke(
    stroke.points.map((point) => [point.x * scaleX, point.y * scaleY]),
    { ...FREEHAND_OPTIONS, size },
  ) as readonly Vec2[];
}

export function sketchStrokePath(stroke: Pick<SketchStroke, "kind" | "points" | "width" | "rotation">, scaleX = 1, scaleY = scaleX): string {
  if (stroke.points.length === 0 || stroke.kind === "text") return "";
  if (stroke.kind === "rectangle") return linePath(stroke.points, scaleX, scaleY);
  if (stroke.kind === "ellipse") return ellipsePath(stroke, scaleX, scaleY);
  if (stroke.kind === "arrow") return arrowPath(stroke.points, stroke.width, scaleX, scaleY);
  return getSvgPathFromStroke(sketchStrokeOutline(stroke, scaleX, scaleY));
}

/** The note's lift off the page, as a pair of soft shadows that keep pointing down however the note is turned. */
function NoteShadow({ id }: { readonly id: string }): ReactElement {
  return (
    <filter id={id} x="-25%" y="-30%" width="150%" height="170%" colorInterpolationFilters="sRGB">
      <feDropShadow dx={0} dy={1} stdDeviation={1} floodColor="#000" floodOpacity={0.14} />
      <feDropShadow dx={0} dy={4} stdDeviation={5} floodColor="#000" floodOpacity={0.12} />
    </filter>
  );
}

/** Lines are spaced to fill the layer's box, so a resized or projected box keeps its text inside it. The words sit on a white note, like a sticky note. */
function SketchTextElement({ stroke, shadowId }: { readonly stroke: SketchStroke; readonly shadowId: string }): ReactElement {
  const { frame, lines, lineHeight } = textLayout(stroke);
  const padding = stroke.width / 2;
  const placement = `translate(${number(frame.center.x)} ${number(frame.center.y)}) rotate(${number((frame.rotation * 180) / Math.PI)})`;
  return (
    <g>
      <g filter={`url(#${shadowId})`}>
        <rect
          x={number(-frame.width / 2 - padding)}
          y={number(-frame.height / 2 - padding)}
          width={number(frame.width + padding * 2)}
          height={number(frame.height + padding * 2)}
          rx={3}
          fill="#fff"
          transform={placement}
          pointerEvents="none"
          data-test="sketch-text-note"
        />
      </g>
      <text
        transform={placement}
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
    </g>
  );
}

export interface SketchSvgLayerProps {
  readonly strokes: readonly SketchStroke[];
}

/**
 * Memoized: strokes are kept in page coordinates and scrolled by a transform around this layer, so scrolling never
 * re-runs the freehand outlines. Pass the same array while the marks are unchanged.
 */
export const SketchSvgLayer = memo(function SketchSvgLayer({ strokes }: SketchSvgLayerProps): ReactElement {
  const shadowId = `${useId()}-note-shadow`;
  return (
    <g data-test="sketch-svg-layer">
      {strokes.some((stroke) => stroke.kind === "text") ? <defs><NoteShadow id={shadowId} /></defs> : null}
      {strokes.map((stroke) => {
        if (stroke.kind === "text") return <SketchTextElement key={stroke.id} stroke={stroke} shadowId={shadowId} />;
        const path = sketchStrokePath(stroke);
        if (!path) return null;
        const color = stroke.color || SKETCH_STROKE_COLOR;
        const shape = isSketchShapeKind(stroke.kind);
        // An arrow is only a line; a rectangle and a circle also take a faint wash of their color.
        const filled = stroke.kind === "rectangle" || stroke.kind === "ellipse";
        return (
          <path
            key={stroke.id}
            d={path}
            fill={shape && !filled ? "none" : color}
            fillOpacity={filled ? SKETCH_RECTANGLE_FILL_OPACITY : undefined}
            stroke={shape ? color : "none"}
            strokeWidth={shape ? stroke.width : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        );
      })}
    </g>
  );
});
