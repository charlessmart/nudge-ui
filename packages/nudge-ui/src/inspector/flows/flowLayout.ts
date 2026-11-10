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

interface Box { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface Point { readonly x: number; readonly y: number }

export interface FlowArrow {
  /** An SVG path of straight segments meeting at right angles, ending on the target frame's edge. */
  readonly path: string;
  /** Where the edge's label sits: on the segment that crosses the gap the arrow travels through. */
  readonly label: Point;
}

/** How far an arrow that cannot run straight between two frames steps clear of them before turning back. */
export const FLOW_ARROW_DETOUR = FLOW_FRAME_GAP / 2;

/**
 * Routes an arrow between two frames with right-angled turns only.
 * Forward (the target starts right of the source): right edge to left edge, turning once in the gap between them.
 * Backward (the target ends left of the source): out of the source's bottom, under both, into the target's bottom.
 * Overlapping columns: out of the source's right edge, around the side, into the target's right edge. Never into
 * a frame's top, where its header sits.
 */
export function flowArrow(from: Box, to: Box): FlowArrow {
  const fromMiddle = from.y + from.height / 2;
  const toMiddle = to.y + to.height / 2;
  if (to.x >= from.x + from.width) {
    const startX = from.x + from.width;
    const turnX = (startX + to.x) / 2;
    return arrow([{ x: startX, y: fromMiddle }, { x: turnX, y: fromMiddle }, { x: turnX, y: toMiddle }, { x: to.x, y: toMiddle }], { x: turnX, y: (fromMiddle + toMiddle) / 2 });
  }
  if (to.x + to.width <= from.x) {
    const startX = from.x + from.width / 2;
    const endX = to.x + to.width / 2;
    const fromBottom = from.y + from.height;
    const toBottom = to.y + to.height;
    const underY = Math.max(fromBottom, toBottom) + FLOW_ARROW_DETOUR;
    return arrow([{ x: startX, y: fromBottom }, { x: startX, y: underY }, { x: endX, y: underY }, { x: endX, y: toBottom }], { x: (startX + endX) / 2, y: underY });
  }
  const fromRight = from.x + from.width;
  const toRight = to.x + to.width;
  const sideX = Math.max(fromRight, toRight) + FLOW_ARROW_DETOUR;
  return arrow([{ x: fromRight, y: fromMiddle }, { x: sideX, y: fromMiddle }, { x: sideX, y: toMiddle }, { x: toRight, y: toMiddle }], { x: sideX, y: (fromMiddle + toMiddle) / 2 });
}

function arrow(points: readonly Point[], label: Point): FlowArrow {
  // Frames level with each other leave a zero-length segment where the arrow would have turned.
  const corners = points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || previous.x !== point.x || previous.y !== point.y;
  });
  return { path: corners.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "), label };
}
