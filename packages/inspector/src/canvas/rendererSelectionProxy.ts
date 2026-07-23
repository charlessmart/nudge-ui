import type { SelectedElement } from "../selectionStore.ts";
import { setSelectedElement } from "../selectionStore.ts";
import type { ElementClickMessage } from "./frameProtocol.ts";
import { selectCard } from "./canvasStore.ts";

function isHtmlElementInDocument(node: Element | null, doc: Document): node is HTMLElement {
  const frameWindow = doc.defaultView;
  return frameWindow !== null && node instanceof frameWindow.HTMLElement;
}

/**
 * Resolve the exact DOM element inside a card's iframe that matches an
 * element-click message. The renderer (running inside the iframe) tells us
 * the clicked element's `data-cid` and `data-src` strings; we re-find the
 * element by attribute equality so that the parent app can mutate the same
 * physical DOM node the user clicked.
 *
 * We match on the pair `(data-cid, data-src)` because `data-cid` alone is
 * shared by every element rendered by the same React component (e.g. every
 * element authored inside `App` carries `data-cid="App"`). Falling back to
 * `data-cid`-only would silently return the first matching element, which
 * could be the wrong one.
 *
 * If an exact source-bearing element no longer exists, fail closed instead of
 * binding the copied component metadata to an unrelated DOM node.
 */
function findClickedElement(
  doc: Document | null | undefined,
  cid: string,
  src: string,
): HTMLElement | null {
  if (!doc) return null;

  const cidMatches = Array.from(doc.querySelectorAll("[data-cid]"))
    .filter((candidate): candidate is HTMLElement => (
      isHtmlElementInDocument(candidate, doc) && candidate.getAttribute("data-cid") === cid
    ));

  if (src) {
    return cidMatches.find((candidate) => candidate.getAttribute("data-src") === src) ?? null;
  }

  return cidMatches.length === 1 ? cidMatches[0] ?? null : null;
}

export function handleElementClick(msg: ElementClickMessage, iframe: HTMLIFrameElement, cardId: string): void {
  const doc = iframe.contentDocument;
  const el = findClickedElement(doc, msg.cid, msg.src);

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
  };

  // setSelectedElement must run before any side effect that could reload the
  // host page, otherwise the selection would be discarded by the unload.
  setSelectedElement(selected);
  selectCard(cardId);
}
