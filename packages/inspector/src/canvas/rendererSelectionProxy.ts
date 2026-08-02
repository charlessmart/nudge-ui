import type { SelectedElement } from "../selectionStore.ts";
import { setSelectedElement } from "../selectionStore.ts";
import type { ElementClickMessage } from "./frameProtocol.ts";
import { selectCard } from "./canvasStore.ts";
import { RENDERER_ELEMENT_ID_ATTR } from "./rendererCidIndex.ts";

function isHtmlElementInDocument(node: Element | null, doc: Document): node is HTMLElement {
  const frameWindow = doc.defaultView;
  return frameWindow !== null && node instanceof frameWindow.HTMLElement;
}

/**
 * Resolve the exact DOM element inside a card's iframe that matches an
 * element-click message. The renderer (running inside the iframe) tells us
 * the clicked element's renderer-owned `elementId`; we re-find the element by
 * that stable data attribute so that the parent app can mutate the same
 * physical DOM node the user clicked.
 *
 * The resolution uses a scoped ID query and never depends on document order.
 *
 * If the exact renderer-owned node no longer exists, fail closed instead of
 * binding the copied component metadata to an unrelated DOM node.
 */
function findClickedElement(
  doc: Document | null | undefined,
  elementId: string,
  cid: string,
  src: string,
): HTMLElement | null {
  if (!doc) return null;
  if (!/^r\d+$/.test(elementId)) return null;
  const candidates = doc.querySelectorAll(`[${RENDERER_ELEMENT_ID_ATTR}="${elementId}"]`);
  if (candidates.length !== 1) return null;
  const candidate = candidates[0] ?? null;
  if (!candidate || candidate.getAttribute("data-cid") !== cid || candidate.getAttribute("data-src") !== src) return null;
  return isHtmlElementInDocument(candidate, doc) ? candidate : null;
}

export function handleElementClick(msg: ElementClickMessage, iframe: HTMLIFrameElement, cardId: string): void {
  const doc = iframe.contentDocument;
  const el = findClickedElement(doc, msg.elementId, msg.cid, msg.src);

  if (!el) {
    setSelectedElement(null);
    selectCard(cardId);
    return;
  }

  const selected: SelectedElement = {
    cid: msg.cid,
    src: el.getAttribute("data-src") ?? msg.src,
    cprops: el.getAttribute("data-cprops"),
    file: msg.file,
    line: msg.line,
    column: 0,
    domElement: el,
    componentTargets: [],
  };

  // setSelectedElement must run before any side effect that could reload the
  // host page, otherwise the selection would be discarded by the unload.
  setSelectedElement(selected);
  selectCard(cardId);
}
