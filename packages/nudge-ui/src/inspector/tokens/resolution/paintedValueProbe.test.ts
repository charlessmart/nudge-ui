// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { contextFreePaintedValue, isContextFreeValue, registerPaintedValueProbeRoot } from "./paintedValueProbe.ts";

describe("isContextFreeValue", () => {
  it.each([
    ["color", "#533afd"],
    ["color", "rgb(83 58 253 / 50%)"],
    ["background-color", "hsl(240, 60%, 50%)"],
    ["padding-top", "16px"],
    ["font-size", "1.25rem"],
    ["box-shadow", "0 1px 2px rgba(0, 0, 0, 0.1), inset 0 0 0 1px #fff"],
    ["font-family", '"sohne-var", "SF Pro Display", sans-serif'],
    ["font-weight", "bold"],
    ["opacity", "0.5"],
  ])("accepts %s: %s", (property, value) => {
    expect(isContextFreeValue(property, value)).toBe(true);
  });

  it.each([
    ["padding-top", "1.5em"],
    ["width", "50%"],
    ["color", "currentColor"],
    ["color", "light-dark(#000, #fff)"],
    ["color", "CanvasText"],
    ["margin", "0 auto"],
    ["padding-top", "calc(1em + 4px)"],
    ["color", "var(--other)"],
    ["font-weight", "bolder"],
    ["color", ""],
    ["color", "rgb(0 0 0"],
  ])("rejects %s: %s", (property, value) => {
    expect(isContextFreeValue(property, value)).toBe(false);
  });
});

describe("contextFreePaintedValue", () => {
  let release: (() => void) | undefined;

  afterEach(() => {
    release?.();
    release = undefined;
    document.body.innerHTML = "";
  });

  function mount(): { box: HTMLElement; root: ShadowRoot } {
    const parent = document.createElement("section");
    parent.style.setProperty("--ink", "#111111");
    parent.style.setProperty("--gap", "1.5em");
    parent.style.setProperty("--alias", "var(--ink)");
    const box = document.createElement("div");
    parent.appendChild(box);
    const host = document.createElement("div");
    document.body.append(parent, host);
    const root = host.attachShadow({ mode: "open" });
    release = registerPaintedValueProbeRoot(document, root);
    return { box, root };
  }

  it("answers only once a probe root is registered", () => {
    const box = document.createElement("div");
    document.body.appendChild(box);
    expect(contextFreePaintedValue(box, "color", "var(--ink)")).toBeNull();
  });

  it("normalizes a context-free token in the probe root and leaves the page untouched", () => {
    const { box, root } = mount();
    const pageNodes = document.querySelectorAll("*").length;
    expect(contextFreePaintedValue(box, "color", "var(--ink)")).not.toBeNull();
    expect(document.querySelectorAll("*").length).toBe(pageNodes);
    expect(root.querySelectorAll('[data-nudge-ui="attribution-probe"]')).toHaveLength(1);
  });

  it("leaves element-relative values and properties to a probe in the page", () => {
    const { box } = mount();
    expect(contextFreePaintedValue(box, "padding-top", "var(--gap)")).toBeNull();
    expect(contextFreePaintedValue(box, "line-height", "var(--ink)")).toBeNull();
    expect(contextFreePaintedValue(box, "border-top-width", "var(--ink)")).toBeNull();
    expect(contextFreePaintedValue(box, "color", "color-mix(in srgb, var(--ink), white)")).toBeNull();
  });

  it("reads a custom property alias from the parent without a probe", () => {
    const { box } = mount();
    expect(contextFreePaintedValue(box, "--surface", "var(--ink)")).toBe("#111111");
  });

  it("removes its probe when the root is released", () => {
    const { box, root } = mount();
    contextFreePaintedValue(box, "color", "var(--ink)");
    release?.();
    release = undefined;
    expect(root.querySelectorAll('[data-nudge-ui="attribution-probe"]')).toHaveLength(0);
    expect(contextFreePaintedValue(box, "color", "var(--ink)")).toBeNull();
  });
});
