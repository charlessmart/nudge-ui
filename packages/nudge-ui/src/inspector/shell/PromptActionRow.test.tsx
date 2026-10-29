// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PromptActionButton, PromptActionRow, type PromptActionRowProps } from "./PromptActionButton.tsx";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("PromptActionRow", () => {
  let host: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host.remove();
  });

  function render(props: Omit<PromptActionRowProps, "children">): void {
    root = createRoot(host);
    act(() => root!.render(
      <PromptActionRow {...props}>
        <PromptActionButton badgeCount={props.hasChanges === true ? 2 : 0} />
      </PromptActionRow>,
    ));
  }

  it("offers a clear changes button, joined to the changes, ahead of the prompt action", () => {
    const onClear = vi.fn();
    render({ hasChanges: true, onClear });

    const clear = host.querySelector<HTMLButtonElement>('[data-test="clear-session"]')!;
    expect(clear.getAttribute("aria-label")).toBe("Clear changes");
    expect(clear.disabled).toBe(false);
    expect(host.querySelector('[data-test="copy-prompt"]')?.contains(clear)).toBe(false);
    expect(clear.closest(".copy-prompt__changes")).not.toBeNull();
    act(() => clear.click());
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("disables the clear button without changes and omits it without a handler", () => {
    render({ hasChanges: false, onClear: () => undefined });
    const clear = host.querySelector<HTMLButtonElement>('[data-test="clear-session"]');
    expect(clear?.disabled).toBe(true);
    act(() => root!.unmount());
    root = null;

    render({ hasChanges: true });
    expect(host.querySelector('[data-test="clear-session"]')).toBeNull();
  });
});
