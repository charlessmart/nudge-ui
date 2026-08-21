/**
 * jsdom fidelity fix for `HTMLElement.prototype.click()`.
 *
 * jsdom fires `.click()` with `composed: true`, so every synthetic test click
 * escapes its shadow root and reaches the document-level capture listeners of
 * the element selector (`elementSelector.ts`). That selector deliberately
 * swallows ordinary application clicks while the inspector is open — correct
 * against a real browser, where `click` events are not composed and
 * shadow-root-internal clicks never reach `document` in the first place.
 *
 * The mismatch made every shadow-DOM interaction test silently lose its click
 * (the selector's capture handler stopped propagation before the target's own
 * listeners ran). Dispatching the event the way a real user click is shaped —
 * bubbling, cancelable, NOT composed — restores browser semantics without
 * weakening the production selector or touching any test call site.
 *
 * Setup files run once per test file in that file's environment, so the guard
 * below keeps the patch inert for Node-environment files where no DOM exists.
 */
if (typeof HTMLElement !== "undefined") {
  const realClick = HTMLElement.prototype.click;

  HTMLElement.prototype.click = function click(this: HTMLElement): void {
    // No `view` member: under vitest's jsdom integration the window proxy
    // fails jsdom's internal `isWindow` identity check, so any truthy view
    // throws. A null view is what omitted members produce and nothing in the
    // suite reads `event.view`.
    this.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }),
    );
  };

  // Referenced so a future revert is an explicit, greppable change rather
  // than silent drift.
  void realClick;
}
