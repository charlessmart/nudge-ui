import type { CanvasFrame } from "./canvasFrame.ts";
import { getFocusedCardId, getSelectedCardId } from "./canvasStore.ts";
import { getRegisteredFrames } from "./projection.ts";

export function resolveActiveCanvasFrame(
  frames: ReadonlyMap<string, CanvasFrame>,
  selectedCardId: string | null,
  focusedCardId: string | null,
): CanvasFrame | null {
  const activeCardId = selectedCardId ?? focusedCardId;
  return activeCardId ? frames.get(activeCardId) ?? null : null;
}

export function getActiveCanvasDocument(): Document | null {
  const frame = getActiveCanvasFrame();
  if (!frame) return null;
  try {
    return frame.contentDocument;
  } catch {
    // Cross-origin frames cannot supply trusted document data.
    return null;
  }
}

export function getActiveCanvasFrame(): CanvasFrame | null {
  return resolveActiveCanvasFrame(
    getRegisteredFrames(),
    getSelectedCardId(),
    getFocusedCardId(),
  );
}
