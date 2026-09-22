// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isEditableEvent, isSendPromptShortcut } from "./shortcuts.ts";

describe("shortcut editable-target detection", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("recognises a focused input inside the inspector shadow root", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    shadow.append(input);
    document.body.append(host);
    input.focus();

    expect(isEditableEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }))).toBe(true);
  });

  it("recognises editable elements in a composed keyboard event path", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    shadow.append(input);
    document.body.append(host);

    let editable = false;
    window.addEventListener("keydown", (event) => {
      editable = isEditableEvent(event);
    }, { once: true });
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, composed: true }));

    expect(editable).toBe(true);
  });

  it("recognises Shift+S without claiming the browser save shortcut", () => {
    expect(isSendPromptShortcut(new KeyboardEvent("keydown", {
      code: "KeyS",
      shiftKey: true,
    }))).toBe(true);
    expect(isSendPromptShortcut(new KeyboardEvent("keydown", {
      code: "KeyS",
      metaKey: true,
    }))).toBe(false);
  });
});
