import { MAX_CAMERA_ZOOM, MIN_CAMERA_ZOOM } from "./viewStore.ts";

export interface LayoutCard {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** The layout fields a creation may change on existing frames. */
export interface LayoutShift {
  readonly id: string;
  readonly from: Pick<LayoutCard, "x" | "y">;
  readonly to: Pick<LayoutCard, "x" | "y">;
}

export function boundsOf(cards: readonly LayoutCard[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const card of cards) {
    minX = Math.min(minX, card.x);
    minY = Math.min(minY, card.y);
    maxX = Math.max(maxX, card.x + card.width);
    maxY = Math.max(maxY, card.y + card.height);
  }
  return { minX, minY, maxX, maxY };
}

/** Places a new frame to the right of every frame, on the first frame's row. */
export function nextCardPosition(cards: readonly LayoutCard[], gap: number): { x: number; y: number } {
  if (cards.length === 0) return { x: 0, y: 0 };
  return { x: Math.max(...cards.map((card) => card.x + card.width + gap)), y: cards[0]!.y };
}

export function pushOverlappingCards<T extends LayoutCard>(cards: readonly T[], protectedIds: ReadonlySet<string>, gap: number): T[] {
  const fixed = cards.filter((card) => protectedIds.has(card.id)).map((card) => boundsOf([card]));
  const moving = cards.filter((card) => !protectedIds.has(card.id)).sort((a, b) => a.x - b.x);
  const shifts = new Map<string, number>();
  for (const card of moving) {
    let bounds = boundsOf([card]);
    let dx = 0;
    let collision = true;
    while (collision) {
      collision = false;
      for (const other of fixed) {
        if (bounds.minY >= other.maxY || bounds.maxY <= other.minY
          || bounds.minX >= other.maxX + gap || bounds.maxX + gap <= other.minX) continue;
        const shift = other.maxX + gap - bounds.minX;
        dx += shift;
        bounds = { ...bounds, minX: bounds.minX + shift, maxX: bounds.maxX + shift };
        collision = true;
      }
    }
    if (dx) shifts.set(card.id, dx);
    fixed.push(bounds);
  }
  return shifts.size ? cards.map((card) => shifts.has(card.id) ? { ...card, x: card.x + shifts.get(card.id)! } : card) : [...cards];
}

export function iterationPosition(cards: readonly LayoutCard[], source: LayoutCard, gap: number): { x: number; y: number } {
  const x = source.x;
  let y = source.y + source.height + gap * 2;
  for (const neighbor of [...cards].sort((a, b) => a.y - b.y)) {
    if (x >= neighbor.x + neighbor.width + gap || x + source.width + gap <= neighbor.x) continue;
    if (y < neighbor.y + neighbor.height + gap * 2 && y + source.height + gap * 2 > neighbor.y) y = neighbor.y + neighbor.height + gap * 2;
  }
  return { x, y };
}

/** Zooms and centers content inside the padded viewport; null for empty content. */
export function fitCamera(bounds: Bounds, viewport: { width: number; height: number }, padding: number): { x: number; y: number; zoom: number } | null {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (width <= 0 || height <= 0) return null;
  const zoom = Math.max(MIN_CAMERA_ZOOM, Math.min(
    Math.max(1, viewport.width - padding * 2) / width,
    Math.max(1, viewport.height - padding * 2) / height,
    MAX_CAMERA_ZOOM,
  ));
  return centerCamera(bounds, zoom, viewport);
}

export function centerCamera(bounds: Bounds, zoom: number, viewport: { width: number; height: number }): { x: number; y: number; zoom: number } {
  return {
    x: -((bounds.minX + bounds.maxX) / 2) * zoom + viewport.width / 2,
    y: -((bounds.minY + bounds.maxY) / 2) * zoom + viewport.height / 2,
    zoom,
  };
}

export function layoutShifts(before: readonly LayoutCard[], after: readonly LayoutCard[]): LayoutShift[] {
  const previous = new Map(before.map((card) => [card.id, card]));
  return after.flatMap((card) => {
    const old = previous.get(card.id);
    if (!old || (old.x === card.x && old.y === card.y)) return [];
    return [{ id: card.id, from: { x: old.x, y: old.y }, to: { x: card.x, y: card.y } }];
  });
}

/** Replays recorded shifts as deltas, so frames moved since the creation keep their later moves. */
export function applyLayoutShifts<T extends LayoutCard>(cards: readonly T[], shifts: readonly LayoutShift[], forward: boolean): T[] {
  const byId = new Map(shifts.map((shift) => [shift.id, shift]));
  return cards.map((card) => {
    const shift = byId.get(card.id);
    if (!shift) return card;
    const from = forward ? shift.from : shift.to;
    const to = forward ? shift.to : shift.from;
    return { ...card, x: card.x + to.x - from.x, y: card.y + to.y - from.y };
  });
}

/** Reinserts recorded frames after their nearest recorded predecessor that still exists. */
export function reinsertInRecordedOrder<T extends LayoutCard>(cards: readonly T[], recorded: readonly T[], ids: ReadonlySet<string>): T[] {
  let next = [...cards];
  for (const [index, added] of recorded.entries()) {
    if (!ids.has(added.id)) continue;
    const preceding = recorded.slice(0, index).reverse().find((card) => next.some((item) => item.id === card.id));
    const insertion = preceding ? next.findIndex((card) => card.id === preceding.id) + 1 : 0;
    next = [...next.slice(0, insertion), { ...added }, ...next.slice(insertion)];
  }
  return next;
}
