// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { getInspectorToggleShortcutLabel, isEditableEvent, isolateTypingKeys, isSendPromptShortcut } from "./shortcuts.ts";

describe("shortcut editable-target detection", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it.each([
    { platform: "MacIntel", expected: "⌘\\" },
    { platform: "Win32", expected: "Ctrl\\" },
  ])("shows $expected on $platform", ({ platform, expected }) => {
    vi.stubGlobal("navigator", { platform, userAgent: "" });

    expect(getInspectorToggleShortcutLabel()).toBe(expected);
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

describe("typing-key isolation", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("keeps keys typed in an inspector field from reaching the page, and lets other keys through", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    const button = document.createElement("button");
    shadow.append(input, button);
    const release = isolateTypingKeys(shadow);
    const pageKeys: string[] = [];
    const captured: string[] = [];
    document.addEventListener("keydown", (event) => pageKeys.push(event.key));
    window.addEventListener("keydown", (event) => captured.push(event.key), true);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true, composed: true }));
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
    release();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true, composed: true }));

    expect({ pageKeys, captured }).toEqual({ pageKeys: ["Escape", "t"], captured: ["s", "Escape", "t"] });
  });
});
