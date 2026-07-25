const INTERACTION_STYLE_ID = "design-tool-interaction-styles";

const INTERACTION_CSS = `
  [data-cid], [data-cid] * {
    cursor: default !important;
    -webkit-user-select: none !important;
    user-select: none !important;
  }

  [data-cid] input,
  [data-cid] textarea,
  [data-cid] [contenteditable="true"] {
    cursor: text !important;
    -webkit-user-select: text !important;
    user-select: text !important;
  }
`;

/** Installs temporary interaction affordances without mutating tracked nodes. */
export function installInteractionStyles(doc: Document = document): () => void {
  let style = doc.getElementById(INTERACTION_STYLE_ID) as HTMLStyleElement | null;
  let created = false;
  if (!style) {
    style = doc.createElement("style");
    style.id = INTERACTION_STYLE_ID;
    style.textContent = INTERACTION_CSS;
    doc.head.append(style);
    created = true;
  }
  return () => {
    if (created) style?.remove();
  };
}
