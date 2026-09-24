import { getSelectedElements, setSelectedElement, toggleSelectedElement } from "../selection/selectionStore.ts";
import { getOpen } from "../shell/openStore.ts";
import { resolveSelectionFromEvent } from "../selection/resolveSelection.ts";
import {
  handleInlineTextEditIntent,
  isInlineTextEditingActive,
  type InlineTextInteractionDisposition,
} from "../inline-text/inlineTextEditor.ts";
import { EMPTY_TEXT_PROJECTION_ATTR } from "../projection/textProjection.ts";
import { blockApplicationClick, isUserClick } from "./clickPolicy.ts";

export function installElementSelector(
  inspectorHost: HTMLElement,
  acceptsClick: (event: MouseEvent) => boolean = isUserClick,
): () => void {
  function applyInlineTextDisposition(
    event: MouseEvent,
    disposition: InlineTextInteractionDisposition,
  ): void {
    if (disposition === "pass-through") return;
    if (disposition === "suppress") event.preventDefault();
    event.stopPropagation();
  }

  function onDoubleClick(e: MouseEvent): void {
    if (!getOpen()) return;
    if (isInsideInspectorUi(e)) return;
    if (getSelectedElements().length > 1) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!(e.target instanceof Element)) return;
    applyInlineTextDisposition(e, handleInlineTextEditIntent({
      kind: "double-click",
      target: e.target,
      point: { x: e.clientX, y: e.clientY },
    }));
  }

  function isInsideInspectorUi(event: MouseEvent): boolean {
    const target = event.target;
    if (!(target instanceof Element)) return false;
    if (inspectorHost === target || inspectorHost.contains(target)) return true;
    // Composed clicks originating inside the inspector's shadow root are
    // retargeted to the host before document-level listeners observe them;
    // this branch covers dispatch paths where retargeting has not applied.
    const root = target.getRootNode();
    return root instanceof ShadowRoot && root.host === inspectorHost;
  }

  function onClick(e: MouseEvent): void {
    if (!getOpen() || !acceptsClick(e)) return;
    if (isInsideInspectorUi(e)) {
      // The selector guards the inspected application only. Clicks on the
      // inspector's own controls must keep their native behavior, so they
      // pass through untouched (no preventDefault / stopPropagation).
      return;
    }
    if (isInlineTextEditingActive()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.target instanceof Element
      && e.target.closest(`[${EMPTY_TEXT_PROJECTION_ATTR}]`)) {
      blockApplicationClick(e);
      return;
    }

    // The inspector is an editing surface while open. Capture every ordinary
    // application click so buttons, links, and untracked controls cannot run
    // alongside selection. Shift-click toggles the primary target in the
    // ordered group; Command/Ctrl-click selects the deepest tracked element.
    const sel = resolveSelectionFromEvent(e, inspectorHost);
    blockApplicationClick(e);
    if (sel) {
      if (e.shiftKey && !e.metaKey && !e.ctrlKey) toggleSelectedElement(sel);
      else setSelectedElement(sel);
    }
  }

  function onMouseDown(e: MouseEvent): void {
    if (!getOpen() || isInsideInspectorUi(e)) return;
    if (!(e.target instanceof Element)) return;
    applyInlineTextDisposition(e, handleInlineTextEditIntent({
      kind: "pointer-down",
      target: e.target,
      point: { x: e.clientX, y: e.clientY },
      clickCount: e.detail,
    }));
  }

  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("dblclick", onDoubleClick, true);
  document.addEventListener("click", onClick, true);
  return () => {
    document.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("dblclick", onDoubleClick, true);
    document.removeEventListener("click", onClick, true);
  };
}
