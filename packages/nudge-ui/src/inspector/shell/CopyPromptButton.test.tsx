// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyPromptButton } from "./CopyPromptButton.tsx";
import { clearActiveDraft, getChangesList } from "../drafts/store.ts";
import type { ElementChangeRecord } from "../changes/types.ts";
import { replaceActiveDraft } from "../changes/_testUtils.ts";
import { setNudgeUiHostDevFlag } from "../runtime/devFlag.ts";
import { initializeSketchStore, resetSketchStore, saveSketch } from "../canvas/sketch/store.ts";
import { resetSketchMemory } from "../canvas/sketch/persistence.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { clearClipboardHandoff } from "../prompt/clipboardHandoff.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function change(): ElementChangeRecord {
  return {
    cid: "Heading",
    file: "src/Heading.tsx",
    line: 2,
    selector: '[data-cid="Heading"]',
    property: "color",
    oldToken: null,
    newToken: null,
    oldRawValue: "black",
    rawValue: "red",
    source: { file: "src/Heading.tsx", line: 2, component: "Heading" },
  };
}

async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

async function copyFromShiftS(): Promise<KeyboardEvent> {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    code: "KeyS",
    key: "s",
    shiftKey: true,
  });
  await act(async () => {
    window.dispatchEvent(event);
    await Promise.resolve();
  });
  return event;
}

describe("CopyPromptButton handoff", () => {
  let container: HTMLDivElement;
  let root: Root;
  let previousConfig: ReturnType<typeof getNudgeUiRuntimeConfig>;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setNudgeUiHostDevFlag(true);
    localStorage.clear();
    clearClipboardHandoff();
    resetSketchStore();
    resetSketchMemory();
    previousConfig = getNudgeUiRuntimeConfig();
    configureNudgeUiRuntime({ ...previousConfig, projectId: "handoff-project" });
    writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    clearActiveDraft();
    clearClipboardHandoff();
    resetSketchStore();
    resetSketchMemory();
    configureNudgeUiRuntime(previousConfig);
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the current change count on the prompt button", async () => {
    act(() => {
      replaceActiveDraft([change(), { ...change(), property: "background-color" }]);
      root.render(<CopyPromptButton />);
    });
    await flush();

    expect(container.querySelector('[data-test="copy-prompt-change-count"]')?.textContent).toBe("2");

    act(() => replaceActiveDraft([change()]));
    expect(container.querySelector('[data-test="copy-prompt-change-count"]')?.textContent).toBe("1");

    act(() => replaceActiveDraft([]));
    expect(container.querySelector('[data-test="copy-prompt-change-count"]')).toBeNull();
  });

  it("copies the prompt and confirms it on the button", async () => {
    act(() => {
      replaceActiveDraft([change()]);
      root.render(<CopyPromptButton />);
    });
    await flush();
    const button = container.querySelector<HTMLButtonElement>('[data-test="copy-prompt"]')!;

    await act(async () => { button.click(); });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain("src/Heading.tsx");
    expect(button.textContent).toContain("Copied!");
    expect(getChangesList()).toEqual([change()]);
  });

  it("leaves a kept sketch out of the prompt: no count, no menu, no reason to enable the button", async () => {
    await initializeSketchStore("handoff-project");
    const image = new Blob(["png"], { type: "image/png" });
    await saveSketch({
      url: window.location.href,
      image,
      imageWidth: 1,
      imageHeight: 1,
    });
    act(() => root.render(<CopyPromptButton />));
    await flush();

    const button = container.querySelector<HTMLButtonElement>('[data-test="copy-prompt"]')!;
    expect(button.textContent).toContain("Copy prompt");
    expect(container.querySelector('[data-test="copy-prompt-change-count"]')).toBeNull();
    expect(button.disabled).toBe(false);
    await act(async () => { button.click(); });
    expect(button.textContent).toContain("Nothing to copy");
    expect(button.querySelector("svg")).toBeNull();
    expect(container.querySelector('[data-test="copy-prompt-menu"]')).toBeNull();
    act(() => replaceActiveDraft([change()]));
    expect(container.querySelector('[data-test="copy-prompt-change-count"]')?.textContent).toBe("1");
  });

  it("copies the available prompt from Shift+S", async () => {
    act(() => root.render(<CopyPromptButton />));
    await flush();
    act(() => replaceActiveDraft([change()]));

    const event = await copyFromShiftS();

    expect(event.defaultPrevented).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain("src/Heading.tsx");
  });

  it("leaves Shift+S available to focused text inputs", async () => {
    act(() => root.render(<CopyPromptButton />));
    await flush();
    act(() => replaceActiveDraft([change()]));

    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    const event = await copyFromShiftS();

    expect(event.defaultPrevented).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
    input.remove();
  });

  it("keeps copied edits pending when the user returns without implementation evidence", async () => {
    act(() => {
      replaceActiveDraft([change()]);
      root.render(<CopyPromptButton />);
    });
    await flush();
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-test="copy-prompt"]')!.click(); });
    expect(container.querySelector('[data-test="handoff-implemented-hint"]')).toBeNull();

    act(() => { window.dispatchEvent(new Event("blur")); });
    act(() => { window.dispatchEvent(new Event("focus")); });

    expect(container.querySelector('[data-test="handoff-implemented-hint"]')).toBeNull();
    expect(container.querySelector('[data-test="handoff-clear-remaining"]')).toBeNull();
    expect(getChangesList()).toEqual([change()]);
  });
});
