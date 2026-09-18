import {
  SKETCH_ANNOTATION_RADIUS,
  type SketchAnnotation,
  type SketchPoint,
  type SketchStroke,
} from "./model.ts";

export interface SketchBounds {
  readonly width: number;
  readonly height: number;
}

export type SketchElementReference =
  | { readonly kind: "stroke"; readonly id: string }
  | { readonly kind: "annotation"; readonly id: string };

function distance(left: SketchPoint, right: SketchPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function distanceToSegment(point: SketchPoint, start: SketchPoint, end: SketchPoint): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) return distance(point, start);
  const projection = ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared;
  const position = Math.max(0, Math.min(1, projection));
  return distance(point, {
    x: start.x + position * deltaX,
    y: start.y + position * deltaY,
  });
}

function distanceToStroke(point: SketchPoint, stroke: SketchStroke): number {
  if (stroke.points.length === 1) return distance(point, stroke.points[0]!);
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < stroke.points.length; index += 1) {
    closest = Math.min(closest, distanceToSegment(point, stroke.points[index - 1]!, stroke.points[index]!));
  }
  return closest;
}

function pointBounds(points: readonly SketchPoint[]): {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, maxX, minY, maxY };
}

/** Returns the topmost drawable object under a point in canvas coordinates. */
export function findSketchElementAt(
  point: SketchPoint,
  strokes: readonly SketchStroke[],
  annotations: readonly SketchAnnotation[],
): SketchElementReference | null {
  for (let index = annotations.length - 1; index >= 0; index -= 1) {
    const annotation = annotations[index]!;
    if (distance(point, annotation.point) <= SKETCH_ANNOTATION_RADIUS * 1.5) {
      return { kind: "annotation", id: annotation.id };
    }
  }

  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const stroke = strokes[index]!;
    const tolerance = Math.max(10, stroke.width / 2 + 6);
    const bounds = pointBounds(stroke.points);
    const insideRectangle = stroke.kind === "rectangle"
      && point.x >= bounds.minX - tolerance
      && point.x <= bounds.maxX + tolerance
      && point.y >= bounds.minY - tolerance
      && point.y <= bounds.maxY + tolerance;
    if (insideRectangle || distanceToStroke(point, stroke) <= tolerance) {
      return { kind: "stroke", id: stroke.id };
    }
  }
  return null;
}

function constrainedDelta(points: readonly SketchPoint[], delta: SketchPoint, bounds: SketchBounds): SketchPoint {
  if (points.length === 0) return delta;
  const { minX, maxX, minY, maxY } = pointBounds(points);
  let x = delta.x;
  let y = delta.y;
  if (minX + x < 0) x = -minX;
  else if (maxX + x > bounds.width) x = bounds.width - maxX;
  if (minY + y < 0) y = -minY;
  else if (maxY + y > bounds.height) y = bounds.height - maxY;
  return { x, y };
}

export function translateSketchStroke(
  stroke: SketchStroke,
  delta: SketchPoint,
  bounds: SketchBounds,
): SketchStroke {
  const constrained = constrainedDelta(stroke.points, delta, bounds);
  return {
    ...stroke,
    points: stroke.points.map((point) => ({
      x: point.x + constrained.x,
      y: point.y + constrained.y,
    })),
  };
}

export function translateSketchAnnotation(
  annotation: SketchAnnotation,
  delta: SketchPoint,
  bounds: SketchBounds,
): SketchAnnotation {
  const constrained = constrainedDelta([annotation.point], delta, bounds);
  return {
    ...annotation,
    point: {
      x: annotation.point.x + constrained.x,
      y: annotation.point.y + constrained.y,
    },
  };
}
