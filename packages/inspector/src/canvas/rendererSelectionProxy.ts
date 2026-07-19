import type { SelectedElement } from "../selectionStore.ts";
import { setSelectedElement } from "../selectionStore.ts";
import type { ElementClickMessage } from "./frameProtocol.ts";
import { selectCard } from "./canvasStore.ts";

export function handleElementClick(msg: ElementClickMessage, iframe: HTMLIFrameElement, cardId: string): void {
  selectCard(cardId);

  const doc = iframe.contentDocument;
  const el = doc ? doc.querySelector(`[data-cid="${msg.cid}"]`) : null;
  const src = el instanceof HTMLElement ? (el.getAttribute("data-src") ?? "") : "";
  const cprops = el instanceof HTMLElement ? el.getAttribute("data-cprops") : null;

  const selected: SelectedElement = {
    cid: msg.cid,
    src,
    cprops,
    file: msg.file,
    line: msg.line,
    column: 0,
    domElement: el instanceof HTMLElement ? el : document.body,
  };

  setSelectedElement(selected);
}
