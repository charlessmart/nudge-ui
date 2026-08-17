import type { SelectedElement } from "./selectionStore.ts";
import { setSelectedElement } from "./selectionStore.ts";
import { getOpen } from "./openStore.ts";
import { resolveSelectionFromEvent } from "./resolveSelection.ts";
import { selectionTargetMode } from "./selectionTarget.ts";
import {
  beginInlineTextEditFromEmptyProjection,
  beginInlineTextEdit,
  isInlineTextEditingActive,
} from "./inlineTextEditor.ts";
import { EMPTY_TEXT_PROJECTION_ATTR } from "./textProjection.ts";

export function installElementSelector(inspectorHost: HTMLElement): () => void {
  function onDoubleClick(e: MouseEvent): void {
    if (!getOpen()) return;
    if (isInlineTextEditingActive()) {
      if (e.target instanceof Element && (inspectorHost === e.target || inspectorHost.contains(e.target))) return;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!(e.target instanceof Element)) return;
    if (inspectorHost === e.target || inspectorHost.contains(e.target)) return;
    const emptyProjectionMarker = e.target.closest<HTMLElement>(`[${EMPTY_TEXT_PROJECTION_ATTR}]`);
    if (emptyProjectionMarker) {
      const result = beginInlineTextEditFromEmptyProjection(emptyProjectionMarker);
      if (!("kind" in result) || result.kind !== "rejected") {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    const target = resolveSelectionTargetForInlineText(e.target);
    if (!target) return;
    const result = beginInlineTextEdit(target, { x: e.clientX, y: e.clientY });
    if (!("kind" in result) || result.kind !== "rejected") {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onClick(e: MouseEvent): void {
    if (!getOpen()) return;
    if (isInlineTextEditingActive()) {
      if (e.target instanceof Element && (inspectorHost === e.target || inspectorHost.contains(e.target))) return;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.target instanceof Element
      && e.target.closest(`[${EMPTY_TEXT_PROJECTION_ATTR}]`)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (
      selectionTargetMode(e) !== "deep"
      && e.target instanceof Element
      && e.target.closest("a[data-design-tool-navigation]")
    ) return;
    // SAFETY: resolveSelectionFromEvent returns SelectedElement when the event passes the navigation guard above.
    const sel = resolveSelectionFromEvent(e, inspectorHost) as SelectedElement | null;
    if (sel) {
      e.preventDefault();
      e.stopPropagation();
      setSelectedElement(sel);
    }
  }
  function resolveSelectionTargetForInlineText(target: Element): HTMLElement | null {
    // Inline editing starts from the deepest visible text host. Holding the
    // modifier still opts into the normal deep selection semantics, but the
    // text editor itself resolves its own component boundary from that host.
    const stack = trackedTextHostStack(target);
    return stack[0] ?? null;
  }

  function trackedTextHostStack(target: Element): HTMLElement[] {
    const stack: HTMLElement[] = [];
    let current: Element | null = target;
    while (current) {
      if (current instanceof HTMLElement && current.hasAttribute("data-cid")) stack.push(current);
      current = current.parentElement;
    }
    return stack;
  }
  document.addEventListener("dblclick", onDoubleClick, true);
  document.addEventListener("click", onClick, true);
  return () => {
    document.removeEventListener("dblclick", onDoubleClick, true);
    document.removeEventListener("click", onClick, true);
  };
}
