import { expect, it } from "vitest";
import type { FlowDefinition } from "../../transport/flows.ts";
import { FLOW_ARROW_DETOUR, flowArrow, flowGrid } from "./flowLayout.ts";

const flow = (ids: string[], edges: [string, string][]): FlowDefinition => ({
  version: 1,
  id: "f",
  title: "F",
  states: ids.map((id) => ({ id, label: id, route: "/" })),
  edges: edges.map(([from, to]) => ({ from, to })),
});

it("puts each state a column after what leads to it and stacks branches", () => {
  const grid = flowGrid(flow(["a", "b", "ok", "err"], [["a", "b"], ["b", "ok"], ["b", "err"]]));
  expect(grid.get("a")).toEqual({ column: 0, row: 0 });
  expect(grid.get("b")).toEqual({ column: 1, row: 0 });
  expect(grid.get("ok")).toEqual({ column: 2, row: 0 });
  expect(grid.get("err")).toEqual({ column: 2, row: 1 });
});

it("survives cycles and self edges", () => {
  const grid = flowGrid(flow(["a", "b", "c"], [["a", "b"], ["b", "a"], ["b", "c"], ["c", "c"], ["c", "a"]]));
  expect(grid.size).toBe(3);
  for (const place of grid.values()) expect(place.column).toBeLessThan(3);
});

const box = (x: number, y: number) => ({ x, y, width: 100, height: 80 });

it("runs an arrow straight across the gap between frames level with each other", () => {
  const arrow = flowArrow(box(0, 0), box(220, 0));
  expect(arrow.path).toBe("M 100 40 L 160 40 L 220 40");
  expect(arrow.label).toEqual({ x: 160, y: 40 });
});

it("turns a branch's arrow at right angles in the gap and labels its vertical run", () => {
  const arrow = flowArrow(box(0, 0), box(220, 280));
  expect(arrow.path).toBe("M 100 40 L 160 40 L 160 320 L 220 320");
  expect(arrow.label).toEqual({ x: 160, y: 180 });
});

it("loops a backward arrow under both frames into the target's bottom", () => {
  const arrow = flowArrow(box(440, 0), box(0, 0));
  expect(arrow.path).toBe(`M 490 80 L 490 ${80 + FLOW_ARROW_DETOUR} L 50 ${80 + FLOW_ARROW_DETOUR} L 50 80`);
  expect(arrow.label).toEqual({ x: 270, y: 80 + FLOW_ARROW_DETOUR });
});

it("goes around the side of frames sharing a column, never into a frame's top", () => {
  const arrow = flowArrow(box(0, 0), box(20, 280));
  const side = 120 + FLOW_ARROW_DETOUR;
  expect(arrow.path).toBe(`M 100 40 L ${side} 40 L ${side} 320 L 120 320`);
});
