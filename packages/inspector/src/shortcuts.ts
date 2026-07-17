export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function isInspectorToggleShortcut(event: KeyboardEvent): boolean {
  if (event.composedPath().some(isEditableTarget)) return false;
  if (event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && event.code === "Backslash") return true;
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.code === "Backslash") return true;
  return event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === "KeyI";
}
