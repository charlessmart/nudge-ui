export type ClickModifiers = Pick<MouseEvent, "ctrlKey" | "metaKey" | "shiftKey">;

/** Command/Ctrl-click selects the deepest tracked element unless Shift is held. */
export function isDeepSelectionClick(event: ClickModifiers): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey;
}

/**
 * Only clicks from a person become inspector selections. Script clicks such
 * as `element.click()` keep reaching the application.
 */
export function isUserClick(event: Pick<Event, "isTrusted">): boolean {
  return event.isTrusted;
}

/** Prevent an inspected application click from reaching the host application. */
export function blockApplicationClick(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}
