import {
  SKETCH_STROKE_OUTLINE,
  SKETCH_TEXT_FONT_FAMILY,
  SKETCH_TEXT_FONT_SIZE,
  SKETCH_TEXT_FONT_WEIGHT,
  SKETCH_TEXT_LINE_HEIGHT,
  SKETCH_TEXT_MIN_FONT_SIZE,
  SKETCH_TEXT_STROKE_WIDTH,
  type SketchPoint,
  type SketchStroke,
  type SketchStrokeColor,
} from "./model.ts";
import { moveStroke, type SketchRegion } from "./selectionFrame.ts";

export interface SketchTextMetrics {
  readonly width: number;
  readonly height: number;
  readonly lineHeight: number;
}

/** Wide enough that an empty-looking line still leaves a grabbable box. */
const MIN_TEXT_WIDTH_EM = 0.5;
/** Used where there is no canvas to measure with. */
const FALLBACK_GLYPH_WIDTH_EM = 0.55;

let measuringContext: CanvasRenderingContext2D | null | undefined;

function getMeasuringContext(): CanvasRenderingContext2D | null {
  if (measuringContext !== undefined) return measuringContext;
  try {
    measuringContext = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  } catch {
    measuringContext = null;
  }
  return measuringContext;
}

export function sketchTextLines(text: string): string[] {
  return text.split("\n");
}

export function sketchTextFont(fontSize: number): string {
  return `${SKETCH_TEXT_FONT_WEIGHT} ${fontSize}px ${SKETCH_TEXT_FONT_FAMILY}`;
}

export function measureSketchText(text: string, fontSize: number): SketchTextMetrics {
  const lines = sketchTextLines(text);
  const lineHeight = fontSize * SKETCH_TEXT_LINE_HEIGHT;
  const context = getMeasuringContext();
  if (context) context.font = sketchTextFont(fontSize);
  let width = 0;
  for (const line of lines) {
    width = Math.max(width, context ? context.measureText(line).width : line.length * fontSize * FALLBACK_GLYPH_WIDTH_EM);
  }
  return { width: Math.max(width, fontSize * MIN_TEXT_WIDTH_EM), height: lines.length * lineHeight, lineHeight };
}

function rotateAbout(point: SketchPoint, angle: number, origin: SketchPoint): SketchPoint {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
}

export interface SketchTextInput {
  readonly id: string;
  /** Top-left corner of the unrotated text box, in drawing coordinates. */
  readonly corner: SketchPoint;
  readonly rotation?: number;
  readonly text: string;
  readonly fontSize?: number;
  readonly color: SketchStrokeColor;
}

/**
 * A text layer is a closed box of points like a rectangle, so the frame, move,
 * resize and rotate all work on it unchanged. `points[0]` stays the box's top-left corner.
 */
export function createTextStroke({
  id,
  corner,
  rotation = 0,
  text,
  fontSize = SKETCH_TEXT_FONT_SIZE,
  color,
}: SketchTextInput): SketchStroke {
  const { width, height } = measureSketchText(text, fontSize);
  const box = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
    { x: 0, y: 0 },
  ];
  return {
    id,
    kind: "text",
    width: SKETCH_TEXT_STROKE_WIDTH,
    color,
    outlineColor: SKETCH_STROKE_OUTLINE,
    points: box.map((point) => {
      const placed = rotateAbout(point, rotation, { x: 0, y: 0 });
      return { x: corner.x + placed.x, y: corner.y + placed.y };
    }),
    text,
    fontSize,
    ...(rotation === 0 ? {} : { rotation }),
  };
}

/** The same layer with new words, keeping its corner, angle, size and color. */
export function retypeTextStroke(stroke: SketchStroke, text: string): SketchStroke {
  return createTextStroke({
    id: stroke.id,
    corner: stroke.points[0] ?? { x: 0, y: 0 },
    rotation: stroke.rotation ?? 0,
    text,
    fontSize: stroke.fontSize ?? SKETCH_TEXT_FONT_SIZE,
    color: stroke.color,
  });
}

/**
 * Slides a text layer back inside `region`, shrinking its type first if it is too big to fit.
 * Returns `null` when even the smallest type would not fit, so nothing hangs off the edge to be cropped later.
 */
export function fitTextStroke(stroke: SketchStroke, region: SketchRegion): SketchStroke | null {
  let fitted = stroke;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const xs = fitted.points.map((point) => point.x);
    const ys = fitted.points.map((point) => point.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    const roomX = region.maxX - region.minX;
    const roomY = region.maxY - region.minY;
    if (width <= roomX && height <= roomY) return moveStroke(fitted, { x: 0, y: 0 }, region);
    const fontSize = (fitted.fontSize ?? SKETCH_TEXT_FONT_SIZE) * Math.min(roomX / width, roomY / height) * 0.98;
    if (fontSize < SKETCH_TEXT_MIN_FONT_SIZE) return null;
    fitted = retypeTextStroke({ ...fitted, fontSize }, fitted.text ?? "");
  }
  return null;
}
