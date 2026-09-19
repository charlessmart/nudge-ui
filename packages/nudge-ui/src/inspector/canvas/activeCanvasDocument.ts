import { getFocusedCardId, getSelectedCardId } from "./canvasStore.ts";
import { getRegisteredFrames } from "./projection.ts";

/** Resolves only the selected or focused frame. */
export function resolveActiveCanvasFrame(
  frames: ReadonlyMap<string, HTMLIFrameElement>,
  selectedCardId: string | null,
  focusedCardId: string | null,
): HTMLIFrameElement | null {
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

/** Returns the iframe that owns the active renderer document. */
export function getActiveCanvasFrame(): HTMLIFrameElement | null {
  return resolveActiveCanvasFrame(
    getRegisteredFrames(),
    getSelectedCardId(),
    getFocusedCardId(),
  );
}
