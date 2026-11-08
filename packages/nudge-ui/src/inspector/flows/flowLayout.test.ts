import { expect, it } from "vitest";
import type { FlowDefinition } from "../../transport/flows.ts";
import { flowGrid } from "./flowLayout.ts";

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
