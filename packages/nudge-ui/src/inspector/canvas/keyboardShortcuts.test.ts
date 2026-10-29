// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { claimShortcutKey } from "./keyboardShortcuts.ts";
import { setAppToolActive, setTemporaryAppInteraction } from "./viewStore.ts";

/** Presses `code` on the body with `claim` on the window's capture phase, and reports whether the page saw it. */
function pageSees(claim: (event: KeyboardEvent) => void): { pageSaw: boolean; prevented: boolean } {
  let pageSaw = false;
  const onPage = (): void => { pageSaw = true; };
  window.addEventListener("keydown", claim, true);
  document.addEventListener("keydown", onPage);
  const event = new KeyboardEvent("keydown", { code: "KeyC", bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  window.removeEventListener("keydown", claim, true);
  document.removeEventListener("keydown", onPage);
  return { pageSaw, prevented: event.defaultPrevented };
}

describe("claimShortcutKey", () => {
  afterEach(() => {
    setAppToolActive(false);
    setTemporaryAppInteraction(false);
  });

  it("keeps a key the inspector acted on from the page's own shortcuts", () => {
    expect(pageSees((event) => claimShortcutKey(event))).toEqual({ pageSaw: false, prevented: true });
  });

  it("leaves the key to the page as well while the app is in use", () => {
    setAppToolActive(true);
    expect(pageSees((event) => claimShortcutKey(event))).toEqual({ pageSaw: true, prevented: true });
    setAppToolActive(false);
    setTemporaryAppInteraction(true);
    expect(pageSees((event) => claimShortcutKey(event))).toEqual({ pageSaw: true, prevented: true });
  });

  it("always wins for the chords that show and hide the inspector", () => {
    setAppToolActive(true);
    expect(pageSees((event) => claimShortcutKey(event, { always: true }))).toEqual({ pageSaw: false, prevented: true });
  });
});
