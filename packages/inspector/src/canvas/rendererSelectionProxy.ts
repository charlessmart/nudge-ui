import type { SelectedElement } from "../selectionStore.ts";
import { setSelectedElement } from "../selectionStore.ts";
import type { ElementClickMessage } from "./frameProtocol.ts";
import { selectCard } from "./canvasStore.ts";

export function handleElementClick(msg: ElementClickMessage, iframe: HTMLIFrameElement, cardId: string): void {
  const doc = iframe.contentDocument;
  let el: HTMLElement | null = null;

  if (doc && msg.file && msg.line > 0) {
    const candidates = doc.querySelectorAll(`[data-cid="${CSS.escape(msg.cid)}"]`);
    for (const candidate of candidates) {
      if (candidate instanceof HTMLElement) {
        const src = candidate.getAttribute("data-src") ?? "";
        if (src.startsWith(`${msg.file}:${msg.line}:`)) {
          el = candidate;
          break;
        }
      }
    }
  }

  if (!el && doc) {
    el = doc.querySelector(`[data-cid="${CSS.escape(msg.cid)}"]`);
  }

  const src = el instanceof HTMLElement ? (el.getAttribute("data-src") ?? "") : "";
  const cprops = el instanceof HTMLElement ? el.getAttribute("data-cprops") : null;

  const selected: SelectedElement = {
    cid: msg.cid,
    src,
    cprops,
    file: msg.file,
    line: msg.line,
    column: 0,
    domElement: (el instanceof HTMLElement ? el : (doc?.body ?? document.body)),
  };

  setSelectedElement(selected);
  selectCard(cardId);
}
