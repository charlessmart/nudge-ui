export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function deeplyFocusedElement(): Element | null {
  let active: Element | null = typeof document === "undefined" ? null : document.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
}

export function isEditableEvent(event: KeyboardEvent): boolean {
  return event.composedPath().some(isEditableTarget) || isEditableTarget(deeplyFocusedElement());
}

export function isInspectorToggleShortcut(event: KeyboardEvent): boolean {
  if (isEditableEvent(event)) return false;
  if (event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && event.code === "Backslash") return true;
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.code === "Backslash") return true;
  return event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === "KeyI";
}
