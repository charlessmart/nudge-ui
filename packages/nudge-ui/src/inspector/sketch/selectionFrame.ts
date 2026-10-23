import {
  SKETCH_TEXT_FONT_SIZE,
  SKETCH_TEXT_MAX_FONT_SIZE,
  SKETCH_TEXT_MIN_FONT_SIZE,
  type SketchPoint,
  type SketchStroke,
} from "./model.ts";

/** Handle sizes are in screen pixels; callers pass `unit` (drawing units per screen pixel) to convert. */
export const FRAME_HANDLE_SIZE_PX = 8;
export const FRAME_ROTATE_OFFSET_PX = 24;
const FRAME_HANDLE_HIT_PX = 8;
const FRAME_EDGE_HIT_PX = 5;
/** Gap between a stroke's outer edge and its frame, in drawing units. */
const FRAME_GAP = 3;
const MIN_RESIZED_EXTENT = 8;
const ROTATE_SNAP_RADIANS = Math.PI / 12;
const REGION_EPSILON = 1e-6;
const FIT_ITERATIONS = 24;

export type FrameCorner = "nw" | "ne" | "se" | "sw";
export type FrameHandle = FrameCorner | "move" | "rotate";

/** The drawing area a stroke must stay inside, in the same coordinates as its points. */
export interface SketchRegion {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * A rotated box around a stroke. `width` and `height` measure the stroke's
 * points along the frame's own axes; the visible frame adds `padding` on every side.
 */
export interface SelectionFrame {
  readonly center: SketchPoint;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly padding: number;
}

const FRAME_CORNERS = ["nw", "ne", "se", "sw"] as const satisfies readonly FrameCorner[];

const CORNER_SIGNS = {
  nw: { x: -1, y: -1 },
  ne: { x: 1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
} as const satisfies Record<FrameCorner, { readonly x: -1 | 1; readonly y: -1 | 1 }>;

function rotatePoint(point: SketchPoint, angle: number, origin: SketchPoint): SketchPoint {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
}

/** Keeps angles in (-π, π] so stored rotations stay within the validated range. */
export function normalizeRotation(angle: number): number {
  const turn = Math.PI * 2;
  const wrapped = ((angle % turn) + turn) % turn;
  return wrapped > Math.PI ? wrapped - turn : wrapped;
}

export function strokeFrame(stroke: Pick<SketchStroke, "points" | "width" | "rotation">): SelectionFrame {
  const rotation = stroke.rotation ?? 0;
  const origin = { x: 0, y: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of stroke.points) {
    const local = rotatePoint(point, -rotation, origin);
    minX = Math.min(minX, local.x);
    maxX = Math.max(maxX, local.x);
    minY = Math.min(minY, local.y);
    maxY = Math.max(maxY, local.y);
  }
  const padding = stroke.width / 2 + FRAME_GAP;
  if (!Number.isFinite(minX)) return { center: origin, width: 0, height: 0, rotation, padding };
  return {
    center: rotatePoint({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, rotation, origin),
    width: maxX - minX,
    height: maxY - minY,
    rotation,
    padding,
  };
}

/** Position relative to the frame center, along the frame's own axes. */
function toLocal(frame: SelectionFrame, point: SketchPoint): SketchPoint {
  const rotated = rotatePoint(point, -frame.rotation, frame.center);
  return { x: rotated.x - frame.center.x, y: rotated.y - frame.center.y };
}

function toWorld(frame: SelectionFrame, local: SketchPoint): SketchPoint {
  return rotatePoint({ x: frame.center.x + local.x, y: frame.center.y + local.y }, frame.rotation, frame.center);
}

function halfExtent(frame: SelectionFrame) {
  return { x: frame.width / 2 + frame.padding, y: frame.height / 2 + frame.padding };
}

/** Whether `point` is inside the stroke's own box (without the frame's gap), grown by `tolerance`. */
export function pointInStrokeBox(
  stroke: Pick<SketchStroke, "points" | "width" | "rotation">,
  point: SketchPoint,
  tolerance: number,
): boolean {
  const frame = strokeFrame(stroke);
  const local = toLocal(frame, point);
  return Math.abs(local.x) <= frame.width / 2 + tolerance && Math.abs(local.y) <= frame.height / 2 + tolerance;
}

export function frameCorner(frame: SelectionFrame, corner: FrameCorner): SketchPoint {
  const half = halfExtent(frame);
  const sign = CORNER_SIGNS[corner];
  return toWorld(frame, { x: sign.x * half.x, y: sign.y * half.y });
}

/** Where the rotation square sits: above the top edge, along the frame's own up axis. */
export function frameRotateHandle(frame: SelectionFrame, unit: number): SketchPoint {
  return toWorld(frame, { x: 0, y: -halfExtent(frame).y - FRAME_ROTATE_OFFSET_PX * unit });
}

function distanceToSegment(point: SketchPoint, start: SketchPoint, end: SketchPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const position = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + position * dx), point.y - (start.y + position * dy));
}

/**
 * Corners and the rotation line win over edges so a handle stays grabbable
 * where it overlaps the border it sits on.
 */
export function hitTestFrame(frame: SelectionFrame, point: SketchPoint, unit: number): FrameHandle | null {
  const handleReach = FRAME_HANDLE_HIT_PX * unit;
  for (const corner of FRAME_CORNERS) {
    const position = frameCorner(frame, corner);
    if (Math.hypot(point.x - position.x, point.y - position.y) <= handleReach) return corner;
  }

  const half = halfExtent(frame);
  const topCenter = toWorld(frame, { x: 0, y: -half.y });
  if (distanceToSegment(point, topCenter, frameRotateHandle(frame, unit)) <= handleReach * 0.75) return "rotate";

  const local = toLocal(frame, point);
  const dx = Math.abs(local.x);
  const dy = Math.abs(local.y);
  const tolerance = FRAME_EDGE_HIT_PX * unit;
  const withinOuter = dx <= half.x + tolerance && dy <= half.y + tolerance;
  const outsideInner = dx >= half.x - tolerance || dy >= half.y - tolerance;
  return withinOuter && outsideInner ? "move" : null;
}

function nearestAxisCursor(angle: number): string {
  const octant = Math.round(normalizeRotation(angle) / (Math.PI / 4));
  switch (((octant % 4) + 4) % 4) {
    case 0: return "ew-resize";
    case 1: return "nwse-resize";
    case 2: return "ns-resize";
    default: return "nesw-resize";
  }
}

/**
 * Edges and the rotation handle show an open hand that closes while the drag is under way. Resize cursors follow the
 * frame's rotation so they keep pointing along the corner's diagonal.
 */
export function frameHandleCursor(handle: FrameHandle, frame: SelectionFrame, dragging: boolean): string {
  if (handle === "move" || handle === "rotate") return dragging ? "grabbing" : "grab";
  const sign = CORNER_SIGNS[handle];
  return nearestAxisCursor(Math.atan2(sign.y, sign.x) + frame.rotation);
}

function strokeInside(stroke: SketchStroke, region: SketchRegion): boolean {
  return stroke.points.every((point) => point.x >= region.minX - REGION_EPSILON
    && point.x <= region.maxX + REGION_EPSILON
    && point.y >= region.minY - REGION_EPSILON
    && point.y <= region.maxY + REGION_EPSILON);
}

/**
 * Builds the transform at full strength and, if it leaves the region, backs off
 * to the largest fraction that still fits, so a fast drag stops flush with the edge.
 */
function withinRegion(
  start: SketchStroke,
  region: SketchRegion,
  build: (strength: number) => SketchStroke,
): SketchStroke {
  const full = build(1);
  if (strokeInside(full, region)) return full;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < FIT_ITERATIONS; iteration += 1) {
    const middle = (low + high) / 2;
    if (strokeInside(build(middle), region)) low = middle;
    else high = middle;
  }
  return low === 0 ? start : build(low);
}

export function moveStroke(start: SketchStroke, delta: SketchPoint, region: SketchRegion): SketchStroke {
  const bounds = start.points.reduce((accumulated, point) => ({
    minX: Math.min(accumulated.minX, point.x),
    maxX: Math.max(accumulated.maxX, point.x),
    minY: Math.min(accumulated.minY, point.y),
    maxY: Math.max(accumulated.maxY, point.y),
  }), { minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY });
  if (!Number.isFinite(bounds.minX)) return start;
  const x = Math.max(region.minX - bounds.minX, Math.min(region.maxX - bounds.maxX, delta.x));
  const y = Math.max(region.minY - bounds.minY, Math.min(region.maxY - bounds.maxY, delta.y));
  return { ...start, points: start.points.map((point) => ({ x: point.x + x, y: point.y + y })) };
}

/**
 * Drags `corner` by the pointer's travel since the gesture began, keeping the
 * opposite corner fixed. Works in the frame's own axes, so rotated strokes
 * resize along their rotated sides. A zero-extent axis (a straight line) keeps its extent.
 */
export function resizeStroke(
  start: SketchStroke,
  corner: FrameCorner,
  pointerStart: SketchPoint,
  pointer: SketchPoint,
  region: SketchRegion,
): SketchStroke {
  const frame = strokeFrame(start);
  const sign = CORNER_SIGNS[corner];
  const origin = toLocal(frame, pointerStart);
  const current = toLocal(frame, pointer);
  const travelX = sign.x * (current.x - origin.x);
  const travelY = sign.y * (current.y - origin.y);
  const text = start.kind === "text";
  const fontSize = start.fontSize ?? SKETCH_TEXT_FONT_SIZE;
  // Type scales evenly, following the pointer's travel along the box's diagonal.
  const diagonal = frame.width * frame.width + frame.height * frame.height;
  const uniform = diagonal === 0
    ? 1
    : Math.min(
      SKETCH_TEXT_MAX_FONT_SIZE / fontSize,
      Math.max(SKETCH_TEXT_MIN_FONT_SIZE / fontSize, 1 + (travelX * frame.width + travelY * frame.height) / diagonal),
    );
  const scaleX = text ? uniform : frame.width === 0
    ? 1
    : Math.max(frame.width + travelX, Math.min(frame.width, MIN_RESIZED_EXTENT)) / frame.width;
  const scaleY = text ? uniform : frame.height === 0
    ? 1
    : Math.max(frame.height + travelY, Math.min(frame.height, MIN_RESIZED_EXTENT)) / frame.height;
  // The corner opposite the one being dragged, relative to the frame center, stays put.
  const anchor = { x: -sign.x * frame.width / 2, y: -sign.y * frame.height / 2 };

  return withinRegion(start, region, (strength) => {
    const factorX = 1 + (scaleX - 1) * strength;
    const factorY = 1 + (scaleY - 1) * strength;
    return {
      ...start,
      ...(text ? { fontSize: fontSize * factorX } : {}),
      points: start.points.map((point) => {
        const local = toLocal(frame, point);
        return toWorld(frame, {
          x: anchor.x + (local.x - anchor.x) * factorX,
          y: anchor.y + (local.y - anchor.y) * factorY,
        });
      }),
    };
  });
}

/** Rotates about the frame center by the pointer's angular travel; `snap` rounds the result to 15°. */
export function rotateStroke(
  start: SketchStroke,
  pointerStart: SketchPoint,
  pointer: SketchPoint,
  region: SketchRegion,
  snap = false,
): SketchStroke {
  const frame = strokeFrame(start);
  const startAngle = Math.atan2(pointerStart.y - frame.center.y, pointerStart.x - frame.center.x);
  const angle = Math.atan2(pointer.y - frame.center.y, pointer.x - frame.center.x);
  let delta = angle - startAngle;
  if (snap) delta = Math.round((frame.rotation + delta) / ROTATE_SNAP_RADIANS) * ROTATE_SNAP_RADIANS - frame.rotation;

  return withinRegion(start, region, (strength) => {
    const applied = delta * strength;
    return {
      ...start,
      rotation: normalizeRotation(frame.rotation + applied),
      points: start.points.map((point) => rotatePoint(point, applied, frame.center)),
    };
  });
}

/** Applies whichever transform `handle` stands for, from the stroke as it was when the drag began. */
export function transformStrokeWithHandle(
  handle: FrameHandle,
  start: SketchStroke,
  pointerStart: SketchPoint,
  pointer: SketchPoint,
  region: SketchRegion,
  snapRotation = false,
): SketchStroke {
  if (handle === "move") {
    return moveStroke(start, { x: pointer.x - pointerStart.x, y: pointer.y - pointerStart.y }, region);
  }
  if (handle === "rotate") return rotateStroke(start, pointerStart, pointer, region, snapRotation);
  return resizeStroke(start, handle, pointerStart, pointer, region);
}
