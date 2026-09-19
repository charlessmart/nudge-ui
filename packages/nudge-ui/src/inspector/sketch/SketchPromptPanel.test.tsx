// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SketchPromptPanel } from "./SketchPromptPanel.tsx";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SketchPromptPanel", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("confirms with Enter when the note is empty", () => {
    const onDone = vi.fn();
    act(() => root.render(
      <SketchPromptPanel
        dataTest="sketch-prompt"
        description=""
        onDescriptionChange={vi.fn()}
        onDone={onDone}
      />,
    ));

    const input = host.querySelector<HTMLTextAreaElement>('[data-test="sketch-prompt-input"]');
    if (!input) throw new Error("Sketch note input did not mount");
    expect(input.rows).toBe(2);
    expect(input.placeholder).toBe("Add a note to your sketch");

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("keeps Shift+Enter available for a second line", () => {
    const onDone = vi.fn();
    act(() => root.render(
      <SketchPromptPanel
        dataTest="sketch-prompt"
        description="First line"
        onDescriptionChange={vi.fn()}
        onDone={onDone}
      />,
    ));

    const input = host.querySelector<HTMLTextAreaElement>('[data-test="sketch-prompt-input"]');
    if (!input) throw new Error("Sketch note input did not mount");
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(onDone).not.toHaveBeenCalled();
  });
});
