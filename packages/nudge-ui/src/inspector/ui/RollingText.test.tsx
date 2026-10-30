// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { RollingText } from "./RollingText.tsx";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("RollingText", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function render(value: string): void {
    act(() => root.render(createElement(RollingText, { value })));
  }

  const rollingIn = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>(".rolling-text__in[data-rolling]")];
  const rollingOut = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>(".rolling-text__out")];

  it("shows the first value without rolling", () => {
    render("0.5×");
    expect(host.textContent).toBe("0.5×");
    expect(rollingIn()).toHaveLength(0);
    expect(rollingOut()).toHaveLength(0);
  });

  it("rolls only the characters that changed, keeping the old one over the new while it fades", () => {
    render("0.5×");
    render("0.6×");
    expect(rollingIn().map((glyph) => glyph.textContent)).toEqual(["6"]);
    expect(rollingOut().map((glyph) => glyph.textContent)).toEqual(["5"]);
  });

  it("lines slots up from the end when the text grows or shrinks", () => {
    render("1×");
    render("0.9×");
    // The "1" slot rolls to "9"; the new "0" and "." slots appear in place without rolling.
    expect(rollingIn().map((glyph) => glyph.textContent)).toEqual(["9"]);
    expect(rollingOut().map((glyph) => glyph.textContent)).toEqual(["1"]);
  });

  it("restarts the roll on every change", () => {
    render("0.5×");
    render("0.6×");
    const first = rollingIn()[0];
    render("0.7×");
    const second = rollingIn()[0];
    expect(second).not.toBe(first);
    expect(second!.textContent).toBe("7");
    expect(rollingOut().map((glyph) => glyph.textContent)).toEqual(["6"]);
  });
});
