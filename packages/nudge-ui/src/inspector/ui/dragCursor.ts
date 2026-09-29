import { DRAG_CURSOR, DRAG_CURSOR_HOTSPOT, DRAG_CURSOR_SIZE, DRAG_CURSOR_URL } from "./customCursors.ts";

export const DRAG_CURSOR_STYLES = `:host { --nudge-drag-cursor: ${DRAG_CURSOR}; }`;

/** Shows the same cursor at a fixed viewport point while the native cursor is locked. */
export function showLockedDragCursor(doc: Document, point: { x: number; y: number }): () => void {
  const cursor = doc.createElement("img");
  cursor.src = DRAG_CURSOR_URL;
  cursor.alt = "";
  cursor.setAttribute("aria-hidden", "true");
  cursor.dataset.test = "locked-drag-cursor";
  cursor.style.cssText = `all: initial; position: fixed; left: ${point.x - DRAG_CURSOR_HOTSPOT.x}px; top: ${point.y - DRAG_CURSOR_HOTSPOT.y}px; width: ${DRAG_CURSOR_SIZE.width}px; height: ${DRAG_CURSOR_SIZE.height}px; pointer-events: none; z-index: 2147483647; user-select: none;`;
  doc.documentElement.append(cursor);
  return () => cursor.remove();
}
