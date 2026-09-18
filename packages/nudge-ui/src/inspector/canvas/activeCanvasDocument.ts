import { getFocusedCardId, getSelectedCardId } from "./canvasStore.ts";
import { getRegisteredFrames } from "./projection.ts";

/** Returns readable Canvas documents in active-first order without duplicates. */
function getCanvasDocumentsInPriorityOrder(): Document[] {
  const frames = getRegisteredFrames();
  const activeIds = [getSelectedCardId(), getFocusedCardId()];
  const orderedFrames: HTMLIFrameElement[] = [];
  const seen = new Set<HTMLIFrameElement>();

  for (const id of activeIds) {
    const frame = id ? frames.get(id) : undefined;
    if (frame && !seen.has(frame)) {
      seen.add(frame);
      orderedFrames.push(frame);
    }
  }
  for (const frame of frames.values()) {
    if (seen.has(frame)) continue;
    seen.add(frame);
    orderedFrames.push(frame);
  }

  const documents: Document[] = [];
  for (const frame of orderedFrames) {
    try {
      if (frame.contentDocument) documents.push(frame.contentDocument);
    } catch {
      // Cross-origin frames cannot supply trusted document data.
    }
  }
  return documents;
}

export function getActiveCanvasDocument(): Document | null {
  return getCanvasDocumentsInPriorityOrder()[0] ?? null;
}

/** Returns the iframe that owns the active renderer document. */
export function getActiveCanvasFrame(): HTMLIFrameElement | null {
  const document = getActiveCanvasDocument();
  if (!document) return null;
  const frame = document.defaultView?.frameElement;
  return frame instanceof HTMLIFrameElement ? frame : null;
}
