import type { SelectedElement } from "../selectionStore.ts";
import { setSelectedElement } from "../selectionStore.ts";
import type { ElementClickMessage } from "./frameProtocol.ts";

export function handleElementClick(msg: ElementClickMessage, iframe: HTMLIFrameElement): void {
  const doc = iframe.contentDocument;
  if (!doc) return;

  const el = doc.querySelector(`[data-cid="${msg.cid}"]`);
  if (!(el instanceof HTMLElement)) return;

  const selected: SelectedElement = {
    cid: msg.cid,
    src: el.getAttribute("data-src") ?? "",
    cprops: el.getAttribute("data-cprops"),
    file: msg.file,
    line: msg.line,
    column: 0,
    domElement: el,
  };

  setSelectedElement(selected);
}
