/** Where a live frame has been, kept by the Canvas rather than the iframe: every frame shares the page's session history, so `history.back()` inside one could move another frame or leave the editor. */
export interface FrameHistory {
  readonly entries: readonly string[];
  readonly index: number;
}

/** Records the frame arriving at a URL, dropping anything ahead of it as a browser does. */
export function visitFrameUrl(history: FrameHistory | null, url: string): FrameHistory {
  if (!history) return { entries: [url], index: 0 };
  if (history.entries[history.index] === url) return history;
  return { entries: [...history.entries.slice(0, history.index + 1), url], index: history.index + 1 };
}

/** The history one step back (-1) or forward (1), or null at that end. */
export function stepFrameHistory(history: FrameHistory | null, delta: -1 | 1): FrameHistory | null {
  if (!history) return null;
  const index = history.index + delta;
  return index >= 0 && index < history.entries.length ? { ...history, index } : null;
}
