// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement, useState } from "react";
import { Stepper } from "./Stepper.tsx";
import { mount, restoreComputedStyle, type MountHandle } from "../styleEditors/_testUtils.ts";

describe("Stepper", () => {
  let handle: MountHandle | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    handle?.unmount();
    handle = null;
    restoreComputedStyle();
    document.body.innerHTML = "";
  });

  /**
   * Controlled harness mirroring GridChildSection usage: the parent owns the
   * value and applies stepper changes to it.
   */
  function mountStepper(initial: number | null, onChange: (next: number) => void) {
    function Harness(): React.ReactElement {
      const [value, setValue] = useState<number | null>(initial);
      return createElement(Stepper, {
        value,
        min: 1,
        max: 12,
        ariaLabel: "Column span",
        prefix: "×",
        onChange: (next: number) => {
          onChange(next);
          setValue(next);
        },
        "data-test": "stepper",
      });
    }
    handle = mount(createElement(Harness));
    return { input: handle.host.querySelector('[data-test="stepper-value"]') as HTMLInputElement };
  }

  function typeValue(input: HTMLInputElement, text: string): void {
    act(() => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, text);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function pressKey(input: HTMLInputElement, key: string): void {
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });
  }

  it("steps within bounds", () => {
    const changes: number[] = [];
    mountStepper(2, (next) => changes.push(next));
    const increment = handle!.host.querySelector('[data-test="stepper-increment"]') as HTMLButtonElement;
    const decrement = handle!.host.querySelector('[data-test="stepper-decrement"]') as HTMLButtonElement;

    act(() => increment.click());
    act(() => increment.click());
    act(() => decrement.click());

    expect(changes).toEqual([3, 4, 3]);
  });

  it("commits a typed value on blur", () => {
    const changes: number[] = [];
    const { input } = mountStepper(2, (next) => changes.push(next));

    typeValue(input, "5");
    act(() => input.blur());

    expect(changes).toEqual([5]);
    expect(input.value).toBe("5");
  });

  it("reverts and does not commit on Escape", () => {
    const changes: number[] = [];
    const { input } = mountStepper(2, (next) => changes.push(next));

    typeValue(input, "9");
    pressKey(input, "Escape");
    act(() => input.blur());

    expect(changes).toEqual([]);
    expect(input.value).toBe("2");
  });
});
