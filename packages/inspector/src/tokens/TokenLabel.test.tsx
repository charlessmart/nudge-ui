// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { act } from "react";
import { TokenLabel } from "./TokenLabel.tsx";
import { mount, type MountHandle } from "../styleEditors/_testUtils.ts";

describe("TokenLabel", () => {
  let handle: MountHandle;

  afterEach(() => {
    handle?.unmount();
    document.body.innerHTML = "";
  });

  it("marks only overflowing labels as truncated and supplies their animation distance", () => {
    handle = mount(createElement(TokenLabel, { title: "--color-accent-subtle" }, "--color-accent-subtle"));

    const label = handle.host.querySelector(".token-label") as HTMLElement;
    const content = label.querySelector(".token-label__content") as HTMLElement;
    let labelWidth = 100;
    let contentWidth = 180;
    Object.defineProperty(label, "clientWidth", { configurable: true, get: () => labelWidth });
    Object.defineProperty(content, "scrollWidth", { configurable: true, get: () => contentWidth });

    act(() => window.dispatchEvent(new Event("resize")));

    expect(label.dataset.truncated).toBe("true");
    expect(label.style.getPropertyValue("--token-label-overflow")).toBe("80px");

    labelWidth = 200;
    contentWidth = 180;
    act(() => window.dispatchEvent(new Event("resize")));

    expect(label.dataset.truncated).toBe("false");
    expect(label.style.getPropertyValue("--token-label-overflow")).toBe("");
  });

  it("keeps the full rendered label text and native tooltip markup available", () => {
    const tokenName = "--color-surface-raised";
    handle = mount(createElement(TokenLabel, { title: tokenName }, tokenName));

    const label = handle.host.querySelector(".token-label") as HTMLElement;

    expect(label.title).toBe(tokenName);
    expect(label.textContent).toBe(tokenName);
    expect(label.querySelector(".token-label__content")?.textContent).toBe(tokenName);
  });
});
