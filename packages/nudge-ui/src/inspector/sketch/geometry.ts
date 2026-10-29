import { distanceToSegment, pointInStrokeBox } from "./selectionFrame.ts";
import type { SketchPoint, SketchStroke } from "./model.ts";
import type { SketchShapeTool } from "./drawingTools.ts";

function distance(left: SketchPoint, right: SketchPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

/** Closed box between two opposite corners, clockwise from the top-left. */
export function rectanglePoints(start: SketchPoint, end: SketchPoint): SketchPoint[] {
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

function distanceToStroke(point: SketchPoint, stroke: SketchStroke): number {
  if (stroke.points.length === 1) return distance(point, stroke.points[0]!);
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < stroke.points.length; index += 1) {
    closest = Math.min(closest, distanceToSegment(point, stroke.points[index - 1]!, stroke.points[index]!));
  }
  return closest;
}

/** What a shape tool stores for a drag from `start` to `end`: a closed box for rectangles and circles, tail and head for an arrow. */
export function shapePoints(tool: SketchShapeTool, start: SketchPoint, end: SketchPoint): SketchPoint[] {
  return tool === "arrow" ? [{ ...start }, { ...end }] : rectanglePoints(start, end);
}

/** The topmost stroke under the point, or null. */
export function findSketchElementAt(
  point: SketchPoint,
  strokes: readonly SketchStroke[],
): string | null {
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const stroke = strokes[index]!;
    const tolerance = Math.max(10, stroke.width / 2 + 6);
    // Rectangles, circles and text are hit anywhere in their (possibly rotated) box, not only along its outline.
    const solid = stroke.kind === "rectangle" || stroke.kind === "ellipse" || stroke.kind === "text";
    if ((solid && pointInStrokeBox(stroke, point, tolerance))
      || (stroke.kind !== "text" && distanceToStroke(point, stroke) <= tolerance)) {
      return stroke.id;
    }
  }
  return null;
}

/** Rectangles and circles are hit on their outline only (the circle's by its box), so erasing inside a box leaves it in place; text is hit anywhere in its box. */
export function findErasedSketchStrokeIds(
  start: SketchPoint,
  end: SketchPoint,
  strokes: readonly SketchStroke[],
  radius: number,
): string[] {
  const steps = Math.max(1, Math.ceil(distance(start, end) / Math.max(1, radius / 2)));
  const samples: SketchPoint[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const position = step / steps;
    samples.push({ x: start.x + (end.x - start.x) * position, y: start.y + (end.y - start.y) * position });
  }
  return strokes
    .filter((stroke) => {
      const tolerance = radius + stroke.width / 2;
      return samples.some((sample) => stroke.kind === "text"
        ? pointInStrokeBox(stroke, sample, radius)
        : distanceToStroke(sample, stroke) <= tolerance);
    })
    .map((stroke) => stroke.id);
}
