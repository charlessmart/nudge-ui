export type ClickModifiers = Pick<MouseEvent, "ctrlKey" | "metaKey" | "shiftKey">;

/** Press/release gestures widgets use to open menus and popovers before any `click` fires. */
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

/** Command/Ctrl-click selects the deepest tracked element; Shift independently adds to the selection. */
export function isDeepSelectionClick(event: ClickModifiers): boolean {
  return event.ctrlKey || event.metaKey;
}

/** Synthetic events like `element.click()` keep reaching the application. */
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
 * Inspector-owned controls rendered inside the application's document (the component sheet's chrome) mark themselves
 * with this attribute so pointer and click events keep their native behaviour while a design tool is active.
 */
export const NATIVE_INTERACTION_ATTRIBUTE = "data-nudge-ui-native-interaction";

/** The active inline text editor and inspector-owned in-page controls keep native pointer and click events. */
export function keepsNativeInteraction(target: EventTarget | null): boolean {
  return typeof Element !== "undefined"
    && target instanceof Element
    && target.closest(`[data-inline-editor="true"], [${NATIVE_INTERACTION_ATTRIBUTE}]`) !== null;
}

/** Document-level listeners, including the inspector's own, still run. */
export function blockApplicationGesture(event: Event): void {
  event.stopPropagation();
}

export function blockApplicationClick(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}
