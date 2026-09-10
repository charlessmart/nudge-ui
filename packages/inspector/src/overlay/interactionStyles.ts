const INTERACTION_STYLE_ID = "nudge-ui-interaction-styles";

const interactionStyleDocuments = new Set<Document>();

const INTERACTION_CSS = `
  [data-cid], [data-cid] * {
    cursor: default !important;
    -webkit-user-select: none !important;
    user-select: none !important;
  }

  [data-cid] input,
  [data-cid] textarea,
  [data-cid] [contenteditable="true"],
  [data-cid] [contenteditable="plaintext-only"] {
    cursor: text !important;
    -webkit-user-select: text !important;
    user-select: text !important;
    outline: 0 !important;
  }

  /*
   * An empty rendered-text projection has no glyph for the browser to hit
   * test. The projection module inserts this inspector-owned slot beside the
   * original empty Text node. It is intentionally borderless: the blue fill
   * is the affordance, while the normal selected-element outline remains a
   * separate overlay.
   */
  [data-empty-text] {
    display: inline-block !important;
    width: 0.75em !important;
    min-width: 0.75em !important;
    height: 1em !important;
    min-height: 1em !important;
    vertical-align: baseline !important;
    border: 0 !important;
    border-radius: 2px !important;
    background: rgba(59, 130, 246, 0.16) !important;
    cursor: text !important;
    -webkit-user-select: none !important;
    user-select: none !important;
    outline: 0 !important;
  }
`;

export function isInteractionStylesInstalled(doc: Document = document): boolean {
  return interactionStyleDocuments.has(doc);
}

/** Installs temporary interaction affordances without mutating tracked nodes. */
export function installInteractionStyles(doc: Document = document): () => void {
  // SAFETY: getElementById returns an Element; the style element is created as HTMLStyleElement below when missing.
  let style = doc.getElementById(INTERACTION_STYLE_ID) as HTMLStyleElement | null;
  let created = false;
  if (!style) {
    style = doc.createElement("style");
    style.id = INTERACTION_STYLE_ID;
    style.textContent = INTERACTION_CSS;
    doc.head.append(style);
    created = true;
  }
  interactionStyleDocuments.add(doc);
  for (const slot of Array.from(doc.querySelectorAll<HTMLElement>("[data-empty-text]"))) {
    slot.hidden = false;
  }
  return () => {
    interactionStyleDocuments.delete(doc);
    for (const slot of Array.from(doc.querySelectorAll<HTMLElement>("[data-empty-text]"))) {
      slot.hidden = true;
    }
    if (created) style?.remove();
  };
}
