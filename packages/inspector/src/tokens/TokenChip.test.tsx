// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { TokenChip } from "./TokenChip.tsx";
import { mount, type MountHandle } from "../styleEditors/_testUtils.ts";

describe("TokenChip", () => {
  let handle: MountHandle;

  afterEach(() => {
    handle?.unmount();
    document.body.innerHTML = "";
  });

  it("composes arbitrary picker content and a separate action", () => {
    handle = mount(createElement(
      TokenChip,
      { size: "small", "data-test": "token-chip-layout", "data-group": "color" },
      createElement(
        TokenChip.Picker,
        { "data-test": "token-chip-picker" },
        createElement("span", { "data-test": "token-chip-swatch" }, "swatch"),
        createElement(TokenChip.Label, null, "--color-primary"),
      ),
      createElement(TokenChip.Action, { "data-test": "token-chip-action" }, "unlink"),
    ));

    const chip = handle.host.querySelector('[data-test="token-chip-layout"]') as HTMLElement;
    const picker = handle.host.querySelector('[data-test="token-chip-picker"]') as HTMLElement;
    const action = handle.host.querySelector('[data-test="token-chip-action"]') as HTMLElement;

    expect(chip.className).toContain("token-chip--small");
    expect(chip.dataset.group).toBe("color");
    expect(picker.querySelector('[data-test="token-chip-swatch"]')).not.toBeNull();
    expect(picker.textContent).toContain("--color-primary");
    expect(action.parentElement).toBe(chip);
  });
});
