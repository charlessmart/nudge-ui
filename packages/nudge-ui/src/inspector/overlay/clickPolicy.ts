export type ClickModifiers = Pick<MouseEvent, "ctrlKey" | "metaKey" | "shiftKey">;

/** Command/Ctrl-click selects the deepest tracked element unless Shift is held. */
export function isDeepSelectionClick(event: ClickModifiers): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey;
}

/** Command/Ctrl+Shift-click intentionally lets the application receive its click. */
export function isApplicationActivationClick(event: ClickModifiers): boolean {
  return (event.ctrlKey || event.metaKey) && event.shiftKey;
}

/** Prevent an inspected application click from reaching the host application. */
export function blockApplicationClick(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}
