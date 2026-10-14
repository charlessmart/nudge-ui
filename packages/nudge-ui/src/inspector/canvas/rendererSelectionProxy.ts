import type { SelectedElement } from "../selection/selectionStore.ts";
import { getSelectedElements, setSelectedElement, toggleSelectedElement } from "../selection/selectionStore.ts";
import type { ElementClickMessage } from "./frameProtocol.ts";
import type { FrameConnection } from "./frameConnection.ts";
import { selectCard } from "./canvasStore.ts";
import { inspectComponentTargets } from "../componentSemantics/index.ts";

/** Selects the exact DOM node the user clicked. Falls back to the card when that node is gone. */
export function handleElementClick(msg: ElementClickMessage, frame: FrameConnection): void {
  const el = frame.element(msg);

  if (!el) {
    setSelectedElement(null);
    selectCard(frame.cardId);
    return;
  }

  const componentTargets = inspectComponentTargets(el);
  const selected: SelectedElement = {
    cid: msg.cid,
    src: el.getAttribute("data-src") ?? msg.src,
    cprops: el.getAttribute("data-cprops"),
    file: msg.file,
    line: msg.line,
    column: 0,
    domElement: el,
    componentTargets,
  };

  // Must run before any side effect that could reload the host page, which would drop the selection.
  const current = getSelectedElements();
  if (msg.additive && current.length > 0 && current.every((candidate) => candidate.domElement.ownerDocument === el.ownerDocument)) {
    toggleSelectedElement(selected);
  } else {
    setSelectedElement(selected);
  }
  selectCard(frame.cardId);
}
