export type ClickModifiers = Pick<MouseEvent, "ctrlKey" | "metaKey" | "shiftKey">;

/**
 * Press and release gestures that application widgets use to open menus,
 * dialogs, and popovers before any `click` fires. The Design tool keeps them
 * from reaching the application.
 */
export const APPLICATION_GESTURE_EVENTS = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "touchstart",
  "touchend",
  "auxclick",
  "contextmenu",
] as const;

/** Command/Ctrl-click selects the deepest tracked element unless Shift is held. */
export function isDeepSelectionClick(event: ClickModifiers): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey;
}

/**
 * Only input from a person becomes inspector selection. Script events such
 * as `element.click()` keep reaching the application.
 */
export function isUserClick(event: Pick<Event, "isTrusted">): boolean {
  return event.isTrusted;
}

/** The active inline text editor needs native press events for caret placement. */
export function isInlineEditorTarget(target: EventTarget | null): boolean {
  return typeof Element !== "undefined"
    && target instanceof Element
    && target.closest('[data-inline-editor="true"]') !== null;
}

/**
 * Keeps an application press gesture from reaching application listeners.
 * Listeners on the document itself, including the inspector's own, still run.
 */
export function blockApplicationGesture(event: Event): void {
  event.stopPropagation();
}

/** Prevent an inspected application click from reaching the host application. */
export function blockApplicationClick(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}
