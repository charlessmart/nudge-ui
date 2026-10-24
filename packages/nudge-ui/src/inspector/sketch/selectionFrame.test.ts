import { describe, expect, it } from "vitest";
import {
  frameCorner,
  frameHandleCursor,
  frameRotateHandle,
  hitTestFrame,
  moveStroke,
  normalizeRotation,
  resizeStroke,
  rotateStroke,
  strokeFrame,
  transformStrokeWithHandle,
  type SketchRegion,
} from "./selectionFrame.ts";
import { SKETCH_STROKE_COLOR, type SketchStroke } from "./model.ts";

const REGION: SketchRegion = { minX: 0, minY: 0, maxX: 400, maxY: 300 };

const rectangle: SketchStroke = {
  id: "rect-1",
  kind: "rectangle",
  width: 4,
  color: SKETCH_STROKE_COLOR,
  points: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 160 }, { x: 100, y: 160 }, { x: 100, y: 100 }],
};

function bounds(stroke: SketchStroke) {
  const xs = stroke.points.map((point) => point.x);
  const ys = stroke.points.map((point) => point.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function expectPoint(actual: { x: number; y: number }, expected: { x: number; y: number }): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

describe("selection frame geometry", () => {
  it("frames the stroke's points plus a gap that clears the line width", () => {
    const frame = strokeFrame(rectangle);

    expectPoint(frame.center, { x: 150, y: 130 });
    expect(frame.width).toBeCloseTo(100);
    expect(frame.height).toBeCloseTo(60);
    expect(frame.padding).toBeGreaterThan(rectangle.width / 2);
    expectPoint(frameCorner(frame, "nw"), { x: 100 - frame.padding, y: 100 - frame.padding });
    expectPoint(frameCorner(frame, "se"), { x: 200 + frame.padding, y: 160 + frame.padding });
  });

  it("keeps the frame tight around a rotated stroke instead of its axis-aligned bounds", () => {
    const rotated = rotateStroke(rectangle, { x: 150, y: 20 }, { x: 150 + 130, y: 130 }, REGION);
    const frame = strokeFrame(rotated);

    expect(Math.abs(rotated.rotation ?? 0)).toBeGreaterThan(0);
    expect(frame.width).toBeCloseTo(100);
    expect(frame.height).toBeCloseTo(60);
    expectPoint(frame.center, { x: 150, y: 130 });
  });

  it("hits corners, the rotation line and edges, and ignores the interior and distant points", () => {
    const frame = strokeFrame(rectangle);
    const nw = frameCorner(frame, "nw");
    const rotate = frameRotateHandle(frame, 1);

    expect(hitTestFrame(frame, nw, 1)).toBe("nw");
    expect(hitTestFrame(frame, frameCorner(frame, "se"), 1)).toBe("se");
    expect(hitTestFrame(frame, rotate, 1)).toBe("rotate");
    expect(hitTestFrame(frame, { x: 150, y: (nw.y + rotate.y) / 2 }, 1)).toBe("rotate");
    expect(hitTestFrame(frame, { x: 150, y: nw.y }, 1)).toBe("rotate");
    expect(hitTestFrame(frame, { x: 130, y: nw.y }, 1)).toBe("move");
    expect(hitTestFrame(frame, { x: frameCorner(frame, "ne").x, y: 130 }, 1)).toBe("move");
    expect(hitTestFrame(frame, { x: 150, y: 130 }, 1)).toBeNull();
    expect(hitTestFrame(frame, { x: 10, y: 10 }, 1)).toBeNull();
  });

  it("scales hit areas with the drawing-to-screen unit so handles stay grabbable when zoomed out", () => {
    const frame = strokeFrame(rectangle);
    const nw = frameCorner(frame, "nw");
    const nearby = { x: nw.x - 14, y: nw.y };

    expect(hitTestFrame(frame, nearby, 1)).toBeNull();
    expect(hitTestFrame(frame, nearby, 2)).toBe("nw");
  });

  it("hit-tests a rotated frame along its own axes", () => {
    const rotated = rotateStroke(rectangle, { x: 150, y: 20 }, { x: 280, y: 130 }, REGION);
    const frame = strokeFrame(rotated);

    expect(hitTestFrame(frame, frameCorner(frame, "ne"), 1)).toBe("ne");
    expect(hitTestFrame(frame, frameRotateHandle(frame, 1), 1)).toBe("rotate");
    expect(hitTestFrame(frame, { x: 150, y: 130 }, 1)).toBeNull();
  });

  it("points resize cursors along the diagonal and turns them with the frame", () => {
    const upright = strokeFrame(rectangle);

    expect(frameHandleCursor("nw", upright, false)).toBe("nwse-resize");
    expect(frameHandleCursor("ne", upright, false)).toBe("nesw-resize");
    expect(frameHandleCursor("nw", { ...upright, rotation: Math.PI / 2 }, false)).toBe("nesw-resize");
    expect(frameHandleCursor("nw", upright, true)).toBe("nwse-resize");
  });

  it("shows an open hand over an edge or the rotation handle, closed while dragging", () => {
    const upright = strokeFrame(rectangle);

    expect(frameHandleCursor("move", upright, false)).toBe("grab");
    expect(frameHandleCursor("move", upright, true)).toBe("grabbing");
    expect(frameHandleCursor("rotate", upright, false)).toBe("grab");
    expect(frameHandleCursor("rotate", upright, true)).toBe("grabbing");
  });

  it("moves a stroke and stops at the region edge", () => {
    expect(bounds(moveStroke(rectangle, { x: 30, y: 20 }, REGION))).toMatchObject({ minX: 130, maxX: 230, minY: 120, maxY: 180 });
    expect(bounds(moveStroke(rectangle, { x: 500, y: -500 }, REGION))).toMatchObject({ maxX: 400, minY: 0 });
  });

  it("resizes from a corner while the opposite corner stays fixed", () => {
    const resized = resizeStroke(rectangle, "se", { x: 200, y: 160 }, { x: 250, y: 220 }, REGION);

    expect(bounds(resized)).toMatchObject({ minX: 100, minY: 100, maxX: 250, maxY: 220 });
    const shrunk = resizeStroke(rectangle, "nw", { x: 100, y: 100 }, { x: 150, y: 120 }, REGION);
    expect(bounds(shrunk)).toMatchObject({ minX: 150, minY: 120, maxX: 200, maxY: 160 });
  });

  it("scales a rotated stroke along its own axes and keeps the opposite corner fixed", () => {
    const rotated = rotateStroke(rectangle, { x: 150, y: 20 }, { x: 280, y: 130 }, REGION);
    const before = strokeFrame(rotated);
    const anchor = frameCorner(before, "nw");
    const grab = frameCorner(before, "se");
    const along = { x: Math.cos(before.rotation), y: Math.sin(before.rotation) };
    const resized = resizeStroke(rotated, "se", grab, { x: grab.x + along.x * 20, y: grab.y + along.y * 20 }, REGION);
    const after = strokeFrame(resized);

    expect(after.width).toBeCloseTo(before.width + 20);
    expect(after.height).toBeCloseTo(before.height);
    expect(after.rotation).toBeCloseTo(before.rotation);
    expectPoint(frameCorner(after, "nw"), anchor);
  });

  it("will not collapse a stroke below a minimum size or flip it through the anchor", () => {
    const squashed = resizeStroke(rectangle, "se", { x: 200, y: 160 }, { x: 0, y: 0 }, REGION);
    const frame = strokeFrame(squashed);

    expect(frame.width).toBeGreaterThanOrEqual(8 - 1e-9);
    expect(frame.height).toBeGreaterThanOrEqual(8 - 1e-9);
    expect(bounds(squashed).minX).toBeCloseTo(100);
  });

  it("leaves a zero-extent axis alone when resizing a straight line", () => {
    const line: SketchStroke = { ...rectangle, kind: "freehand", points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] };
    const resized = resizeStroke(line, "se", { x: 200, y: 100 }, { x: 260, y: 180 }, REGION);

    expect(bounds(resized)).toMatchObject({ minX: 100, maxX: 260, minY: 100, maxY: 100 });
  });

  it("stops resizing flush with the region edge", () => {
    const resized = resizeStroke(rectangle, "se", { x: 200, y: 160 }, { x: 900, y: 160 }, REGION);

    expect(bounds(resized).maxX).toBeCloseTo(400, 2);
    expect(bounds(resized).minX).toBeCloseTo(100);
  });

  it("rotates about the frame center by the pointer's angular travel", () => {
    const rotated = rotateStroke(rectangle, { x: 150, y: 20 }, { x: 280, y: 130 }, REGION);

    expect(rotated.rotation).toBeCloseTo(Math.PI / 2);
    expectPoint(strokeFrame(rotated).center, { x: 150, y: 130 });
    expectPoint(rotated.points[0]!, { x: 180, y: 80 });
  });

  it("snaps rotation to 15° steps when asked", () => {
    const pointer = { x: 150 + 100 * Math.sin(0.3), y: 130 - 100 * Math.cos(0.3) };
    const free = rotateStroke(rectangle, { x: 150, y: 20 }, pointer, REGION);
    const snapped = rotateStroke(rectangle, { x: 150, y: 20 }, pointer, REGION, true);

    expect(free.rotation).toBeCloseTo(0.3);
    expect(snapped.rotation).toBeCloseTo(Math.PI / 12);
  });

  it("never rotates a stroke outside the region", () => {
    const nearEdge: SketchStroke = {
      ...rectangle,
      points: rectangle.points.map((point) => ({ x: point.x + 190, y: point.y })),
    };
    const rotated = rotateStroke(nearEdge, { x: 340, y: 20 }, { x: 470, y: 130 }, REGION);
    const { minX, maxX, minY, maxY } = bounds(rotated);

    expect(minX).toBeGreaterThanOrEqual(-1e-6);
    expect(maxX).toBeLessThanOrEqual(400 + 1e-6);
    expect(minY).toBeGreaterThanOrEqual(-1e-6);
    expect(maxY).toBeLessThanOrEqual(300 + 1e-6);
  });

  it("normalizes rotations into (-π, π]", () => {
    expect(normalizeRotation(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(normalizeRotation(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
    expect(normalizeRotation(0.5)).toBeCloseTo(0.5);
  });

  it("dispatches each handle to its transform", () => {
    const start = { x: 200, y: 160 };

    expect(bounds(transformStrokeWithHandle("move", rectangle, start, { x: 210, y: 170 }, REGION)))
      .toMatchObject({ minX: 110, minY: 110 });
    expect(bounds(transformStrokeWithHandle("se", rectangle, start, { x: 230, y: 190 }, REGION)))
      .toMatchObject({ minX: 100, maxX: 230, maxY: 190 });
    expect(transformStrokeWithHandle("rotate", rectangle, { x: 150, y: 20 }, { x: 280, y: 130 }, REGION).rotation)
      .toBeCloseTo(Math.PI / 2);
  });
});
