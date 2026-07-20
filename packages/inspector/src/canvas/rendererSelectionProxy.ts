import type { SelectedElement } from "../selectionStore.ts";
import { setSelectedElement } from "../selectionStore.ts";
import type { ElementClickMessage } from "./frameProtocol.ts";
import { selectCard } from "./canvasStore.ts";

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
 * Returns the iframe's `<body>` as a last-resort fallback so downstream
 * consumers never receive the parent's body when no match is found.
 */
function findClickedElement(
  doc: Document | null | undefined,
  cid: string,
  src: string,
): HTMLElement | null {
  if (!doc) return null;

  // Exact (cid, src) match wins. CSS.escape keeps attribute selectors safe
  // for cids that contain colons, brackets, or other selector metacharacters.
  if (src) {
    const cidAttr = CSS.escape(cid);
    const srcAttr = CSS.escape(src);
    const exact = doc.querySelector(
      `[data-cid="${cidAttr}"][data-src="${srcAttr}"]`,
    );
    if (exact instanceof HTMLElement) return exact;
  }

  // Fall back to the renderer's stated line if we have it but no exact src.
  // This preserves behaviour for stray elements that may have lost their
  // data-src during an HMR pass.
  const cidAttr = CSS.escape(cid);
  const cidMatches = doc.querySelectorAll(`[data-cid="${cidAttr}"]`);
  for (const candidate of cidMatches) {
    if (candidate instanceof HTMLElement) return candidate;
  }
  return null;
}

export function handleElementClick(msg: ElementClickMessage, iframe: HTMLIFrameElement, cardId: string): void {
  const doc = iframe.contentDocument;
  const el = findClickedElement(doc, msg.cid, msg.src);

  const domElement: HTMLElement = el instanceof HTMLElement
    ? el
    : (doc?.body ?? document.body);

  const selected: SelectedElement = {
    cid: msg.cid,
    src: el instanceof HTMLElement ? (el.getAttribute("data-src") ?? msg.src ?? "") : (msg.src ?? ""),
    cprops: el instanceof HTMLElement ? el.getAttribute("data-cprops") : null,
    file: msg.file,
    line: msg.line,
    column: 0,
    domElement,
  };

  // setSelectedElement must run before any side effect that could reload the
  // host page, otherwise the selection would be discarded by the unload.
  setSelectedElement(selected);
  selectCard(cardId);
}
