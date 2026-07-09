import type { SelectedElement } from "./selectionStore.ts";
import { setSelectedElement } from "./selectionStore.ts";
import { getOpen } from "./openStore.ts";
import { resolveSelectionFromEvent } from "./resolveSelection.ts";

export function installElementSelector(inspectorHost: HTMLElement): () => void {
  function onClick(e: MouseEvent): void {
    if (!getOpen()) return;
    const sel = resolveSelectionFromEvent(e, inspectorHost) as SelectedElement | null;
    if (sel) {
      e.preventDefault();
      e.stopPropagation();
      setSelectedElement(sel);
    }
  }
  document.addEventListener("click", onClick, true);
  return () => {
    document.removeEventListener("click", onClick, true);
  };
}