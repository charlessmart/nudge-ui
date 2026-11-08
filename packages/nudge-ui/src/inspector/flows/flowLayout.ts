import type { FlowDefinition } from "../../transport/flows.ts";

export const FLOW_DEFAULT_VIEWPORT = { width: 1280, height: 800 } as const;
export const FLOW_FRAME_GAP = 120;
/** Room above each frame for its header, which keeps its screen size as the board zooms out. */
export const FLOW_ROW_GAP = 200;
/** Room between the board's lowest frame and a new flow, for the flow's title above its frames' headers at any zoom. */
export const FLOW_TOP_GAP = 400;

/** Grid position of each state: its column is its longest path from a state nothing leads to, branches stack below. */
export function flowGrid(flow: FlowDefinition): Map<string, { column: number; row: number }> {
  const depth = new Map(flow.states.map((state) => [state.id, 0]));
  // Relaxing once per state settles every path without looping forever on a cycle.
  for (let pass = 0; pass < flow.states.length; pass += 1) {
    const reached = new Set<string>();
    for (const edge of flow.edges) {
      if (edge.from === edge.to || reached.has(`${edge.to}>${edge.from}`)) continue;
      reached.add(`${edge.from}>${edge.to}`);
      const next = (depth.get(edge.from) ?? 0) + 1;
      if (next > (depth.get(edge.to) ?? 0) && next < flow.states.length) depth.set(edge.to, next);
    }
  }
  const used = new Map<number, number>();
  const grid = new Map<string, { column: number; row: number }>();
  for (const state of flow.states) {
    const column = depth.get(state.id) ?? 0;
    const row = used.get(column) ?? 0;
    used.set(column, row + 1);
    grid.set(state.id, { column, row });
  }
  return grid;
}
