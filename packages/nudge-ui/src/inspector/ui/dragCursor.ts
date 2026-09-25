const DRAG_CURSOR_SVG = `<svg width="18" height="9.5" viewBox="0 0 36 19" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#right)"><path d="M19.1253 13.3682V3.50181C19.1253 2.77104 19.8836 2.28706 20.5464 2.5948L31.1718 7.52799C31.9436 7.88635 31.9436 8.98365 31.1718 9.34201L20.5464 14.2752C19.8836 14.5829 19.1253 14.099 19.1253 13.3682Z" fill="black" stroke="white"/></g>
<g filter="url(#left)"><path d="M16.1253 13.3682V3.50181C16.1253 2.77104 15.367 2.28706 14.7042 2.5948L4.07889 7.52799C3.30704 7.88635 3.30704 8.98365 4.07889 9.34201L14.7042 14.2752C15.367 14.5829 16.1253 14.099 16.1253 13.3682Z" fill="black" stroke="white"/></g>
<defs>
<filter id="right" x="15.6253" y="0" width="19.6253" height="18.87" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dy="1"/><feGaussianBlur stdDeviation="1.5"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="shadow"/><feBlend mode="normal" in="SourceGraphic" in2="shadow" result="shape"/></filter>
<filter id="left" x="0" y="0" width="19.6253" height="18.87" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dy="1"/><feGaussianBlur stdDeviation="1.5"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="shadow"/><feBlend mode="normal" in="SourceGraphic" in2="shadow" result="shape"/></filter>
</defs></svg>`;

export const DRAG_CURSOR_URL = `data:image/svg+xml,${encodeURIComponent(DRAG_CURSOR_SVG)}`;
export const DRAG_CURSOR = `url("${DRAG_CURSOR_URL}") 9 4, ew-resize`;
export const DRAG_CURSOR_STYLES = `:host { --nudge-drag-cursor: ${DRAG_CURSOR}; }`;

/** Shows the same cursor at a fixed viewport point while the native cursor is locked. */
export function showLockedDragCursor(doc: Document, point: { x: number; y: number }): () => void {
  const cursor = doc.createElement("img");
  cursor.src = DRAG_CURSOR_URL;
  cursor.alt = "";
  cursor.setAttribute("aria-hidden", "true");
  cursor.dataset.test = "locked-drag-cursor";
  cursor.style.cssText = `all: initial; position: fixed; left: ${point.x - 9}px; top: ${point.y - 4}px; width: 18px; height: 9.5px; pointer-events: none; z-index: 2147483647; user-select: none;`;
  doc.documentElement.append(cursor);
  return () => cursor.remove();
}
