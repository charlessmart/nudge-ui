import { DESIGN_SELECT_CURSOR, INTERACTION_CURSOR_PROPERTY, SPACING_CURSOR_PROPERTY } from "../ui/customCursors.ts";
import { adoptStylesheet, allowsStyleElements, releaseAdoptedStylesheet } from "../runtime/ownedStylesheets.ts";
import { isPageSurface } from "../canvas/pageSurface.ts";

const INTERACTION_STYLE_ID = "nudge-ui-interaction-styles";

const interactionStyleDocuments = new Set<Document>();

/**
 * Host adapters tag every rendered element at build time, so the rules follow `data-cid`. The page surface tags elements lazily as the pointer reaches them, and a selector keyed on that attribute makes each new tag restyle the tagged element's whole subtree, which on a large page means a document-wide recalculation per hover.
 */
function interactionCss(pageSurface: boolean): string {
  const tracked = pageSurface ? "html, html *" : "html, body,\n  [data-cid], [data-cid] *";
  const scope = pageSurface ? "html " : "[data-cid] ";
  const interactionCursor = `var(${INTERACTION_CURSOR_PROPERTY}, ${DESIGN_SELECT_CURSOR})`;
  // The spacing property is non-inheriting where the renderer could register it, so a handle hover restyles two elements rather than their subtrees.
  const cursor = pageSurface ? `var(${SPACING_CURSOR_PROPERTY}, ${interactionCursor})` : interactionCursor;
  return `
  ${tracked} {
    cursor: ${cursor} !important;
    -webkit-user-select: none !important;
    user-select: none !important;
  }

  ${scope}input,
  ${scope}textarea,
  ${scope}[contenteditable="true"],
  ${scope}[contenteditable="plaintext-only"] {
    cursor: text !important;
    -webkit-user-select: text !important;
    user-select: text !important;
    outline: 0 !important;
  }

  /* Inspector-owned hit target for empty text projections, which have no glyph to hit test. */
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
}

export function isInteractionStylesInstalled(doc: Document = document): boolean {
  return interactionStyleDocuments.has(doc);
}

/** Installs affordances via a stylesheet, leaving tracked nodes untouched. */
export function installInteractionStyles(doc: Document = document): () => void {
  if (!allowsStyleElements(doc)) return installAdoptedInteractionStyles(doc);
  // SAFETY: getElementById returns an Element; the style element is created as HTMLStyleElement below when missing.
  let style = doc.getElementById(INTERACTION_STYLE_ID) as HTMLStyleElement | null;
  let created = false;
  if (!style) {
    style = doc.createElement("style");
    style.id = INTERACTION_STYLE_ID;
    style.textContent = interactionCss(isPageSurface());
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

function installAdoptedInteractionStyles(doc: Document): () => void {
  adoptStylesheet(doc, INTERACTION_STYLE_ID, interactionCss(isPageSurface()));
  interactionStyleDocuments.add(doc);
  for (const slot of Array.from(doc.querySelectorAll<HTMLElement>("[data-empty-text]"))) {
    slot.hidden = false;
  }
  return () => {
    interactionStyleDocuments.delete(doc);
    for (const slot of Array.from(doc.querySelectorAll<HTMLElement>("[data-empty-text]"))) {
      slot.hidden = true;
    }
    releaseAdoptedStylesheet(doc, INTERACTION_STYLE_ID);
  };
}
