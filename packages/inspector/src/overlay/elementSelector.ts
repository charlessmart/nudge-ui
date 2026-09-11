import { getSelectedElements, setSelectedElement, toggleSelectedElement } from "../selection/selectionStore.ts";
import { getOpen } from "../shell/openStore.ts";
import { resolveSelectionFromEvent } from "../selection/resolveSelection.ts";
import {
  handleInlineTextEditIntent,
  isInlineTextEditingActive,
} from "../inline-text/inlineTextEditor.ts";
import { EMPTY_TEXT_PROJECTION_ATTR } from "../projection/textProjection.ts";
import { blockApplicationClick, isApplicationActivationClick } from "./clickPolicy.ts";

export function installElementSelector(inspectorHost: HTMLElement): () => void {
  function onDoubleClick(e: MouseEvent): void {
    if (!getOpen()) return;
    if (isInsideInspectorUi(e)) return;
    if (getSelectedElements().length > 1) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!(e.target instanceof Element)) return;
    if (inspectorHost === e.target || inspectorHost.contains(e.target)) return;
    const result = handleInlineTextEditIntent({
      kind: "double-click",
      target: e.target,
      point: { x: e.clientX, y: e.clientY },
    });
    if (result.kind === "native-editor") {
      // The text-edit module deliberately passes through double-clicks inside
      // its native host. Stop application handlers without cancelling the
      // browser's native word-selection behavior.
      e.stopPropagation();
      return;
    }
    if (result.kind !== "rejected" && result.kind !== "pass-through") {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (result.kind === "pass-through" && isInlineTextEditingActive()) {
      // Non-editable application targets remain inert while a draft is
      // waiting for an explicit binding or scope decision.
      e.preventDefault();
      e.stopPropagation();
    }
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
    if (!getOpen()) return;
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
    if (isApplicationActivationClick(e)) return;

    // The inspector is an editing surface while open. Capture every ordinary
    // application click so buttons, links, and untracked controls cannot run
    // alongside selection. Shift-click toggles the primary target in the
    // ordered group; Command/Ctrl-click still selects the deepest tracked
    // element, and Command/Ctrl+Shift-click remains the activation escape hatch.
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
    const result = handleInlineTextEditIntent({
      kind: "pointer-down",
      target: e.target,
      point: { x: e.clientX, y: e.clientY },
      clickCount: e.detail,
    });
    if (result.kind === "pass-through" || result.kind === "rejected") return;
    if (result.kind !== "guarded" && result.kind !== "native-editor") e.preventDefault();
    e.stopPropagation();
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
