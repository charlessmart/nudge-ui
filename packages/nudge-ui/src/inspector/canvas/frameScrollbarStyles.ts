export const FRAME_SCROLLBAR_STYLE_ID = "nudge-ui-frame-scrollbar-styles";

// `:where()` keeps specificity at zero so any application scrollbar rule wins.
const FRAME_SCROLLBAR_CSS = `
  :where(html) {
    scrollbar-color: rgba(128, 128, 128, 0.5) transparent;
  }

  :where(*) {
    scrollbar-width: thin;
  }
`;

/** Gives frame documents thin scrollbars over a transparent track by default. */
export function installFrameScrollbarStyles(doc: Document): () => void {
  if (!doc.head || doc.getElementById(FRAME_SCROLLBAR_STYLE_ID)) return () => undefined;
  const style = doc.createElement("style");
  style.id = FRAME_SCROLLBAR_STYLE_ID;
  style.textContent = FRAME_SCROLLBAR_CSS;
  doc.head.append(style);
  return () => style.remove();
}
