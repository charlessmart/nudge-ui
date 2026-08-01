import type { SelectedElement } from "../selectionStore.ts";
import { setSelectedElement } from "../selectionStore.ts";
import type { ElementClickMessage } from "./frameProtocol.ts";
import { selectCard } from "./canvasStore.ts";
import { escapeAttrValue } from "../managedStylesheet.ts";

function isHtmlElementInDocument(node: Element | null, doc: Document): node is HTMLElement {
  const frameWindow = doc.defaultView;
  return frameWindow !== null && node instanceof frameWindow.HTMLElement;
}

/**
 * Resolve the exact DOM element inside a card's iframe that matches an
 * element-click message. The renderer (running inside the iframe) tells us
 * the clicked element's `data-cid`, `data-src` strings and its
 * `instanceIndex`; we re-find the element by attribute equality so that the
 * parent app can mutate the same physical DOM node the user clicked.
 *
 * We match on the pair `(data-cid, data-src)` because `data-cid` alone is
 * shared by every element rendered by the same React component (e.g. every
 * element authored inside `App` carries `data-cid="App"`). Falling back to
 * `data-cid`-only would silently return the first matching element, which
 * could be the wrong one.
 *
 * The resolution uses a SCOPED engine query (`[data-cid="<cid>"]`) instead of
 * scanning every `[data-cid]` in the frame, and picks `matches[instanceIndex]`
 * so a large card is never scanned per click.
 *
 * If an exact source-bearing element no longer exists, fail closed instead of
 * binding the copied component metadata to an unrelated DOM node.
 */
function findClickedElement(
  doc: Document | null | undefined,
  cid: string,
  src: string,
  instanceIndex: number,
): HTMLElement | null {
  if (!doc) return null;

  const cidMatches = Array.from(doc.querySelectorAll<HTMLElement>(`[data-cid="${escapeAttrValue(cid)}"]`))
    .filter((candidate) => isHtmlElementInDocument(candidate, doc));

  if (src) {
    return cidMatches
      .filter((candidate) => candidate.getAttribute("data-src") === src)[instanceIndex] ?? null;
  }

  if (cidMatches.length !== 1) return null;
  return cidMatches[instanceIndex] ?? null;
}

export function handleElementClick(msg: ElementClickMessage, iframe: HTMLIFrameElement, cardId: string): void {
  const doc = iframe.contentDocument;
  const el = findClickedElement(doc, msg.cid, msg.src, msg.instanceIndex);

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
