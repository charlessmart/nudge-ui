// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { TokenLabel } from "./TokenLabel.tsx";
import { mount, type MountHandle } from "../styleEditors/_testUtils.ts";

describe("TokenLabel", () => {
  let handle: MountHandle;

  afterEach(() => {
    handle?.unmount();
    document.body.innerHTML = "";
  });

  it("keeps the full rendered label text and native tooltip available", () => {
    const tokenName = "--color-surface-raised";
    handle = mount(createElement(TokenLabel, { title: tokenName }, tokenName));

    const label = handle.host.querySelector(".token-label") as HTMLElement;

    expect(label.title).toBe(tokenName);
    expect(label.textContent).toBe(tokenName);
    expect(label.querySelector(".token-label__content")?.textContent).toBe(tokenName);
  });
});
