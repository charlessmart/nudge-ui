// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { colorValueToHex, TokenField, TokenValueField } from "./TokenField.tsx";
import type { TokenEntry } from "../../css/model/index.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";
import { resetPendingRules, getChangeRecords } from "./editActions.ts";
import { undo, redo } from "../drafts/store.ts";
import { configureSystemFontSource, type SystemFontAccess, type SystemFontSource } from "../runtime/systemFonts.ts";
import {
  makeSelected,
  mount,
  mockComputedStyle,
  restoreComputedStyle,
  sheetText,
  type MountHandle,
} from "../styleEditors/_testUtils.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FONT_SIZE: TokenEntry = {
  name: "--font-size-base",
  value: "16px",
  source: "styles.css:1",
};

const COLOR_PRIMARY: TokenEntry = {
  name: "--color-primary",
  value: "#2563eb",
  source: "styles.css:2",
};

function pointerEvent(
  type: string,
  { clientX, pointerId = 1, shiftKey = false }: {
    clientX: number;
    pointerId?: number;
    shiftKey?: boolean;
  },
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { configurable: true, value: 0 },
    pointerType: { configurable: true, value: "mouse" },
    clientX: { configurable: true, value: clientX },
    pointerId: { configurable: true, value: pointerId },
    shiftKey: { configurable: true, value: shiftKey },
  });
  return event;
}

function mockPointerCapture(handle: HTMLElement) {
  const setPointerCapture = vi.fn();
  const hasPointerCapture = vi.fn(() => true);
  const releasePointerCapture = vi.fn();
  Object.defineProperties(handle, {
    setPointerCapture: { configurable: true, value: setPointerCapture },
    hasPointerCapture: { configurable: true, value: hasPointerCapture },
    releasePointerCapture: { configurable: true, value: releasePointerCapture },
  });
  return { setPointerCapture, hasPointerCapture, releasePointerCapture };
}

function tokenRow(): ResolvedProperty {
  return {
    property: "font-size",
    tokenName: FONT_SIZE.name,
    declaredValue: `var(${FONT_SIZE.name})`,
    resolvedValue: FONT_SIZE.value,
    confidence: "exact",
    evidence: { reason: "test fixture" },
  };
}

describe("TokenField", () => {
  let handle: MountHandle;

  beforeEach(() => {
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("nudge-ui-styles")?.remove();
    mockComputedStyle({ "font-size": "16px" });
  });

  afterEach(() => {
    handle?.unmount();
    restoreComputedStyle();
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("nudge-ui-styles")?.remove();
  });

  it("waits until blur before applying a raw value and records one committed edit", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-size",
      domElement: selected.domElement,
      entries: [FONT_SIZE],
    }));
    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;

    act(() => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "18px");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(sheetText()).toBe("");
    expect(getChangeRecords()).toHaveLength(0);

    act(() => input.blur());

    expect(sheetText()).toContain("font-size: 18px;");
    expect(getChangeRecords()).toHaveLength(1);
  });

  it("blocks a font-size field when the value is authored inline", () => {
    const { selected } = makeSelected();
    selected.domElement.style.setProperty("font-size", "24px");
    mockComputedStyle({ "font-size": "24px" });
    handle = mount(createElement(TokenField, {
      property: "font-size",
      domElement: selected.domElement,
      entries: [],
      label: "Font size",
    }));

    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(handle.host.querySelector('[data-test="inline-style-warning"]')?.getAttribute("aria-label"))
      .toContain("font-size: 24px");
  });

  it("offers raw CSS suggestions in the same dropdown as token suggestions", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "width",
      initialValue: "auto",
      domElement: selected.domElement,
      entries: [],
      suggestions: ["auto", "100%", "fit-content"],
    }));
    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;

    act(() => input.focus());

    expect(document.body.querySelector('[data-test="raw-suggestion-item"]')).not.toBeNull();
    expect(Array.from(document.body.querySelectorAll<HTMLElement>('[data-test="raw-suggestion-item"]')).map((item) => item.textContent)).toEqual([
      "auto",
      "100%",
      "fit-content",
    ]);
  });

  it.each([
    ["padding-top", "8", "8px"],
    ["font-size", "1", "1px"],
    ["line-height", "120", "120%"],
    ["line-height", "1.6", "160%"],
    ["letter-spacing", "0.04", "0.04em"],
    ["font-weight", "500", "500"],
  ])("completes a bare number for %s", (property, rawValue, expected) => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property,
      domElement: selected.domElement,
      entries: [],
    }));
    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;

    act(() => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, rawValue);
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.blur();
    });

    expect(sheetText()).toContain(`${property}: ${expected};`);
  });

  it("normalises a computed pixel line-height to the percentage editing default", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "line-height": "24px", "font-size": "16px" });
    handle = mount(createElement(TokenField, {
      property: "line-height",
      domElement: selected.domElement,
      entries: [],
    }));

    expect((handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).value).toBe("150%");
  });

  it("shows an authored literal instead of the browser's computed serialization", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "font-size": "16px" });
    handle = mount(createElement(TokenField, {
      property: "font-size",
      tokenRow: {
        property: "font-size",
        tokenName: null,
        declaredValue: "1rem",
        authored: "1rem",
        resolvedValue: "16px",
        computed: "16px",
        capability: "atomic",
        confidence: "unknown",
        evidence: { reason: "test fixture" },
      },
      domElement: selected.domElement,
      entries: [],
    }));

    expect((handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).value).toBe("1rem");
  });

  it("shows only the first direct font family and leaves a token fallback as a token chip", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-family",
      tokenRow: {
        property: "font-family",
        tokenName: null,
        declaredValue: '"Aster Display", Georgia, serif',
        authored: '"Aster Display", Georgia, serif',
        resolvedValue: '"Aster Display", Georgia, serif',
        capability: "composite",
        confidence: "unknown",
        evidence: { reason: "test fixture" },
      },
      domElement: selected.domElement,
      entries: [],
    }));
    expect((handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).value).toBe('"Aster Display"');

    handle.unmount();
    handle = mount(createElement(TokenField, {
      property: "font-family",
      tokenRow: {
        property: "font-family",
        tokenName: "--type-family-body",
        declaredValue: "var(--type-family-body, Georgia, serif)",
        authored: "var(--type-family-body, Georgia, serif)",
        resolvedValue: "Inter, ui-sans-serif, system-ui, sans-serif",
        capability: "atomic",
        confidence: "exact",
        evidence: { reason: "test fixture" },
      },
      domElement: selected.domElement,
      entries: [{ name: "--type-family-body", value: "Inter, ui-sans-serif, system-ui, sans-serif", source: "fixture.css:1" }],
    }));
    expect(handle.host.querySelector('[data-test="token-chip"]')?.textContent).toContain("--type-family-body");
    expect(handle.host.querySelector('[data-test="raw-input"]')).toBeNull();
  });

  it("nudges a raw numeric field immediately and keeps one current style value", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "padding-top": "16px" });
    handle = mount(createElement(TokenField, {
      property: "padding-top",
      domElement: selected.domElement,
      entries: [],
    }));
    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;

    act(() => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowDown",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(input.value).toBe("9px");
    expect(sheetText()).toContain("padding-top: 9px;");
    expect(getChangeRecords()).toHaveLength(1);
  });

  it("nudges a raw numeric field by dragging its leading handle", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "padding-top": "16px" });
    handle = mount(createElement(TokenField, {
      property: "padding-top",
      domElement: selected.domElement,
      entries: [],
      leading: createElement("span", { "data-test": "field-icon" }, "↔"),
    }));
    const dragHandle = handle.host.querySelector('[data-test="nudge-handle"]') as HTMLElement;
    const capture = mockPointerCapture(dragHandle);

    act(() => dragHandle.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, pointerId: 7 })));
    expect(dragHandle.getAttribute("data-dragging")).toBe("true");
    expect(capture.setPointerCapture).toHaveBeenCalledWith(7);

    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 116, pointerId: 7 })));

    expect((handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).value).toBe("17px");
    expect(sheetText()).toContain("padding-top: 17px;");

    act(() => dragHandle.dispatchEvent(pointerEvent("pointerup", { clientX: 116, pointerId: 7 })));
    expect(dragHandle.getAttribute("data-dragging")).toBeNull();
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it("pulls the field harder while a drag pushes on against a limit, and unwinds before the value moves", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "padding-top": "0px" });
    handle = mount(createElement(TokenField, {
      property: "padding-top",
      domElement: selected.domElement,
      entries: [],
      leading: createElement("span", null, "↔"),
    }));
    const dragHandle = handle.host.querySelector('[data-test="nudge-handle"]') as HTMLElement;
    mockPointerCapture(dragHandle);
    const input = () => handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    const stretch = () => {
      const surface = handle.host.querySelector("[data-nudge-elastic]") as HTMLElement;
      return Number.parseFloat(surface.style.getPropertyValue("--nudge-stretch"));
    };

    act(() => dragHandle.dispatchEvent(pointerEvent("pointerdown", { clientX: 200 })));
    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 160 })));
    const shallow = stretch();
    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 60 })));
    expect(input().value).toBe("0px");
    expect(stretch()).toBeGreaterThan(shallow);

    // Pulling back unwinds the overshoot first, so the value stays put while the stretch relaxes.
    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 100 })));
    expect(input().value).toBe("0px");
    expect(stretch()).toBeLessThan(shallow * 10);
    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 200 })));
    expect(input().value).toBe("0px");
    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 230 })));
    expect(input().value).toBe("1px");
  });

  it("undoes a complete field drag and redoes its final value", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "padding-top": "16px" });
    handle = mount(createElement(TokenField, {
      property: "padding-top",
      domElement: selected.domElement,
      entries: [],
      leading: createElement("span", null, "↔"),
    }));
    const dragHandle = handle.host.querySelector('[data-test="nudge-handle"]') as HTMLElement;
    mockPointerCapture(dragHandle);

    act(() => dragHandle.dispatchEvent(pointerEvent("pointerdown", { clientX: 100 })));
    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 104 })));
    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 120 })));
    act(() => dragHandle.dispatchEvent(pointerEvent("pointerup", { clientX: 120 })));
    expect(sheetText()).toContain("padding-top: 17px;");

    act(() => { expect(undo()).toBe(true); });
    expect(getChangeRecords()).toEqual([]);
    expect(sheetText()).not.toContain("padding-top:");
    act(() => { expect(redo()).toBe(true); });
    expect(sheetText()).toContain("padding-top: 17px;");
  });

  it("overrides a token with a raw value when dragging its leading handle", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "padding-top": "16px" });
    handle = mount(createElement(TokenField, {
      property: "padding-top",
      tokenRow: { ...tokenRow(), property: "padding-top" },
      domElement: selected.domElement,
      entries: [FONT_SIZE],
      leading: createElement("span", { "data-test": "field-icon" }, "↔"),
    }));
    const dragHandle = handle.host.querySelector('[data-test="nudge-handle"]') as HTMLElement;
    mockPointerCapture(dragHandle);

    act(() => dragHandle.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, pointerId: 14 })));
    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 116, pointerId: 14 })));

    expect((handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).value).toBe("17px");
    expect(handle.host.querySelector('[data-test="token-chip"]')).toBeNull();
    expect(sheetText()).toContain("padding-top: 17px;");
  });

  it("keeps dragging when pointer lock is unavailable", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "padding-top": "16px" });
    handle = mount(createElement(TokenField, {
      property: "padding-top",
      domElement: selected.domElement,
      entries: [],
      leading: createElement("span", { "data-test": "field-icon" }, "↔"),
    }));
    const dragHandle = handle.host.querySelector('[data-test="nudge-handle"]') as HTMLElement;
    const capture = mockPointerCapture(dragHandle);

    act(() => dragHandle.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, pointerId: 12 })));

    // Pointer capture keeps the drag attached while the cursor reports its normal client position.
    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 116, pointerId: 12 })));
    expect((handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).value).toBe("17px");

    act(() => dragHandle.dispatchEvent(pointerEvent("pointerup", { clientX: 116, pointerId: 12 })));
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(12);
  });

  it("snaps to the next 8px boundary when Shift starts mid-drag", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "padding-top": "16px" });
    handle = mount(createElement(TokenValueField, {
      property: "padding-top",
      domElement: selected.domElement,
      committedValue: "16px",
      entries: [],
      leading: createElement("span", { "data-test": "field-icon" }, "↔"),
      onCommitRaw: vi.fn(),
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));
    const dragHandle = handle.host.querySelector('[data-test="nudge-handle"]') as HTMLElement;
    mockPointerCapture(dragHandle);

    act(() => dragHandle.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, pointerId: 13 })));
    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 116, pointerId: 13 })));
    expect((handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).value).toBe("17px");

    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 118, pointerId: 13, shiftKey: true })));
    expect((handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).value).toBe("17px");

    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 124, pointerId: 13, shiftKey: true })));
    expect((handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).value).toBe("24px");

    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 132, pointerId: 13, shiftKey: true })));
    expect((handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).value).toBe("32px");
  });

  it("uses the large nudge step while Shift-dragging", () => {
    const onCommitRaw = vi.fn();
    const { selected } = makeSelected();
    handle = mount(createElement(TokenValueField, {
      property: "border-radius",
      domElement: selected.domElement,
      committedValue: "16px",
      entries: [],
      leading: createElement("span", { "data-test": "field-icon" }, "↔"),
      onCommitRaw,
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));
    const dragHandle = handle.host.querySelector('[data-test="nudge-handle"]') as HTMLElement;
    mockPointerCapture(dragHandle);

    act(() => dragHandle.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, pointerId: 9 })));
    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 116, pointerId: 9, shiftKey: true })));

    expect((handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).value).toBe("32px");
    expect(onCommitRaw).toHaveBeenLastCalledWith("32px");
  });

  it("cleans up captured drags on pointerup, pointercancel, and blur", () => {
    const onCommitRaw = vi.fn();
    const { selected } = makeSelected();
    handle = mount(createElement(TokenValueField, {
      property: "margin-top",
      domElement: selected.domElement,
      committedValue: "16px",
      entries: [],
      leading: createElement("span", { "data-test": "field-icon" }, "↔"),
      onCommitRaw,
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));
    const dragHandle = handle.host.querySelector('[data-test="nudge-handle"]') as HTMLElement;
    const capture = mockPointerCapture(dragHandle);

    for (const endType of ["pointerup", "pointercancel", "blur"]) {
      act(() => dragHandle.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, pointerId: 11 })));
      expect(dragHandle.getAttribute("data-dragging")).toBe("true");
      act(() => dragHandle.dispatchEvent(pointerEvent(endType, { clientX: 100, pointerId: 11 })));
      expect(dragHandle.getAttribute("data-dragging")).toBeNull();

      const committedCount = onCommitRaw.mock.calls.length;
      act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 110, pointerId: 11 })));
      expect(onCommitRaw).toHaveBeenCalledTimes(committedCount);
    }

    expect(capture.releasePointerCapture).toHaveBeenCalledTimes(3);
  });

  it("does not expose the drag affordance for non-literal or disabled values", () => {
    const { selected } = makeSelected();
    const leading = createElement("span", { "data-test": "field-icon" }, "↔");
    handle = mount(createElement(TokenValueField, {
      property: "padding-top",
      domElement: selected.domElement,
      committedValue: "auto",
      entries: [],
      leading,
      onCommitRaw: vi.fn(),
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));
    expect(handle.host.querySelector('[data-test="nudge-handle"]')).toBeNull();

    handle.unmount();
    handle = mount(createElement(TokenValueField, {
      property: "padding-top",
      domElement: selected.domElement,
      committedValue: "16px",
      entries: [],
      leading,
      disabled: true,
      onCommitRaw: vi.fn(),
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));
    expect(handle.host.querySelector('[data-test="nudge-handle"]')).toBeNull();
  });

  it("keeps horizontal arrows available for text navigation", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "padding-top": "16px" });
    handle = mount(createElement(TokenField, {
      property: "padding-top",
      domElement: selected.domElement,
      entries: [],
    }));
    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;

    act(() => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });

    expect(input.value).toBe("16px");
    expect(sheetText()).toBe("");
    expect(getChangeRecords()).toHaveLength(0);
  });

  it("nudges an active global line-height token through the shared raw field", () => {
    const onCommitRaw = vi.fn();
    handle = mount(createElement(TokenValueField, {
      property: "--line-height-body",
      committedValue: "1.5",
      entries: [],
      onCommitRaw,
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));
    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;

    act(() => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    });

    expect(input.value).toBe("160%");
    expect(onCommitRaw).toHaveBeenCalledWith("160%");
  });

  it("renders a token-backed value as an inline chip", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-size",
      tokenRow: tokenRow(),
      domElement: selected.domElement,
      entries: [FONT_SIZE],
    }));

    const chip = handle.host.querySelector('[data-test="token-chip"]') as HTMLButtonElement;
    expect(chip).not.toBeNull();
    // A numeric token reads as its value; the name is the tooltip.
    expect(chip.textContent).toBe("16");
    expect(handle.host.querySelector('[data-test="token-select"]')).toBeNull();
  });

  it("renders a compact numeric token value", () => {
    const { selected } = makeSelected();
    const radiusToken: TokenEntry = {
      name: "--radius-card",
      value: "12px",
      source: "styles.css:3",
    };
    handle = mount(createElement(TokenField, {
      property: "border-radius",
      tokenRow: {
        property: "border-radius",
        tokenName: radiusToken.name,
        declaredValue: `var(${radiusToken.name})`,
        resolvedValue: radiusToken.value,
        capability: "atomic",
        confidence: "exact",
        evidence: { reason: "test fixture" },
      },
      domElement: selected.domElement,
      entries: [radiusToken],
    }));

    const chip = handle.host.querySelector('.token-chip') as HTMLElement;
    const label = chip.querySelector(".token-chip__label") as HTMLElement;
    expect(label.textContent).toBe("12");
    expect(label.getAttribute("title")).toBeNull();
    expect(label.getAttribute("data-base-ui-tooltip-trigger")).toBe("");
  });

  it("renders a separable color token and alpha as a chip plus opacity", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "background-color",
      tokenRow: {
        property: "background-color",
        tokenName: COLOR_PRIMARY.name,
        declaredValue: "color-mix(in srgb, var(--color-primary) 50%, transparent)",
        authored: "color-mix(in srgb, var(--color-primary) 50%, transparent)",
        resolvedValue: "rgb(37, 99, 235)",
        tokens: [{ name: COLOR_PRIMARY.name, origin: "project" }],
        opacity: { value: "50%", authoredValue: "50%", source: "color-mix", tokenName: null },
        modifiers: [{ kind: "alpha", value: "50%" }],
        capability: "color",
        confidence: "probable",
        evidence: { reason: "test fixture" },
      },
      domElement: selected.domElement,
      entries: [COLOR_PRIMARY],
    }));

    expect(handle.host.querySelector('[data-test="token-chip"]')?.textContent).toContain(COLOR_PRIMARY.name);
    expect((handle.host.querySelector('[data-test="color-opacity-input"]') as HTMLInputElement).value).toBe("50%");
    expect(handle.host.querySelector('[data-test="raw-input"]')).toBeNull();
  });

  it("does not fall back to a lossy token swap when semantic replacement is unsupported", () => {
    const { selected } = makeSelected();
    const current: TokenEntry = {
      name: "theme.colors.red",
      value: "#ff0000",
      cssValue: "#ff0000",
      source: "tailwind.config.js:1",
      adapter: "tailwind-v3",
    };
    const unsupported: TokenEntry = {
      name: "theme.colors.current",
      value: "currentColor",
      cssValue: "currentColor",
      source: "tailwind.config.js:2",
      adapter: "tailwind-v3",
    };
    handle = mount(createElement(TokenField, {
      property: "color",
      tokenRow: {
        property: "color",
        tokenName: current.name,
        declaredValue: "rgb(255 0 0 / var(--tw-text-opacity))",
        authored: "rgb(255 0 0 / var(--tw-text-opacity))",
        resolvedValue: "rgba(255, 0, 0, 0.5)",
        tokens: [{ name: current.name, origin: "framework" }],
        opacity: { value: "50%", authoredValue: "var(--tw-text-opacity)", source: "rgb", tokenName: null },
        color: { hasEmbeddedAlpha: true, isExpression: false, opacityEditable: true },
        modifiers: [{ kind: "alpha", value: "50%" }],
        capability: "color",
        confidence: "exact",
        evidence: { reason: "test fixture" },
      },
      domElement: selected.domElement,
      entries: [current, unsupported],
    }));

    act(() => (handle.host.querySelector('[data-test="token-chip"]') as HTMLButtonElement).click());
    const option = Array.from(document.body.querySelectorAll<HTMLElement>('[data-test="suggestion-item"]'))
      .find((item) => item.textContent?.includes(unsupported.name));
    expect(option).toBeDefined();
    act(() => option!.click());

    expect(sheetText()).toBe("");
    expect(handle.host.querySelector('[data-test="token-chip"]')?.textContent).toContain(current.name);
  });

  it("filters alternatives from the active token chip picker", () => {
    const { selected } = makeSelected();
    const alternate: TokenEntry = {
      name: "--font-size-large",
      value: "20px",
      source: "styles.css:3",
    };
    const other: TokenEntry = {
      name: "--space-4",
      value: "16px",
      source: "styles.css:4",
    };
    handle = mount(createElement(TokenField, {
      property: "font-size",
      tokenRow: tokenRow(),
      domElement: selected.domElement,
      entries: [FONT_SIZE, alternate, other],
    }));

    act(() => (handle.host.querySelector('[data-test="token-chip"]') as HTMLButtonElement).click());
    const search = document.body.querySelector('[data-test="token-chip-search"]') as HTMLInputElement;
    expect(search).not.toBeNull();
    expect(search.getAttribute("aria-label")).toBe("Search tokens");

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, "large");
      search.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const suggestions = Array.from(document.body.querySelectorAll<HTMLElement>('[data-test="suggestion-item"]'));
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.textContent).toContain(alternate.name);
  });

  it("checks the active token at the trailing edge of its menu row", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-size",
      tokenRow: tokenRow(),
      domElement: selected.domElement,
      entries: [FONT_SIZE, { name: "--font-size-large", value: "20px", source: "styles.css:3" }],
    }));

    act(() => (handle.host.querySelector('[data-test="token-chip"]') as HTMLButtonElement).click());
    const rows = Array.from(document.body.querySelectorAll<HTMLElement>('[data-test="suggestion-item"]'));
    const active = rows.find((row) => row.textContent?.includes(FONT_SIZE.name))!;
    const other = rows.find((row) => row.textContent?.includes("--font-size-large"))!;
    // The check closes the current row instead of starting it, matching the font-style menu.
    expect(active.querySelector(".popover-listbox__leading")).toBeNull();
    expect(active.lastElementChild?.getAttribute("data-test")).toBe("popover-listbox-indicator");
    expect(other.querySelector('[data-test="popover-listbox-indicator"]')).toBeNull();
  });

  it("shows authored functional CSS without an inline token attribution label", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "width",
      tokenRow: {
        property: "width",
        tokenName: "--space-4",
        declaredValue: "calc(var(--space-4) * 2)",
        authored: "calc(var(--space-4) * 2)",
        resolvedValue: "32px",
        computed: "32px",
        tokens: [{ name: "--space-4", origin: "project" }],
        capability: "raw",
        confidence: "probable",
        evidence: { reason: "test fixture" },
      },
      domElement: selected.domElement,
      entries: [FONT_SIZE],
    }));
    const rawInput = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    expect(rawInput.value).toBe("calc(var(--space-4) * 2)");
    expect(handle.host.querySelector('[data-test="token-attribution"]')).toBeNull();
    expect(handle.host.querySelector('[data-test="token-chip"]')).toBeNull();
  });

  it("returns to a raw input when a token chip is unlinked", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-size",
      tokenRow: tokenRow(),
      domElement: selected.domElement,
      entries: [FONT_SIZE],
    }));

    act(() => {
      (handle.host.querySelector('[data-test="delink-btn"]') as HTMLButtonElement).click();
    });

    expect(handle.host.querySelector('[data-test="raw-input"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-chip"]')).toBeNull();
  });

  it("detaches with Backspace while the token menu search is empty", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-size",
      tokenRow: tokenRow(),
      domElement: selected.domElement,
      entries: [FONT_SIZE],
    }));

    act(() => (handle.host.querySelector('[data-test="token-chip"]') as HTMLButtonElement).click());
    const search = document.querySelector('[data-test="token-chip-search"]') as HTMLInputElement;
    act(() => {
      search.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    });

    expect(handle.host.querySelector('[data-test="raw-input"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-chip"]')).toBeNull();
  });

  it("detaches from the first token menu item", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-size",
      tokenRow: tokenRow(),
      domElement: selected.domElement,
      entries: [FONT_SIZE],
    }));

    act(() => (handle.host.querySelector('[data-test="token-chip"]') as HTMLButtonElement).click());
    const items = document.querySelectorAll(".popover-listbox__item");
    expect(items[0]?.getAttribute("data-test")).toBe("detach-token-item");
    expect(items[0]?.textContent).toContain("Detach token");
    act(() => (items[0] as HTMLElement).click());

    expect(handle.host.querySelector('[data-test="raw-input"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-chip"]')).toBeNull();
  });

  it("keeps the unlink action in the token chip, outside the picker trigger", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-size",
      tokenRow: tokenRow(),
      domElement: selected.domElement,
      entries: [FONT_SIZE],
    }));

    const chip = handle.host.querySelector(".token-chip") as HTMLElement;
    const picker = handle.host.querySelector('[data-test="token-chip"]') as HTMLButtonElement;
    const delink = handle.host.querySelector('[data-test="delink-btn"]') as HTMLButtonElement;
    expect(chip.contains(delink)).toBe(true);
    expect(picker.contains(delink)).toBe(false);
    expect(delink.classList).toContain("icon-button");
    expect(delink.classList).toContain("icon-button--quiet");
    expect(delink.classList).toContain("icon-button--compact");
  });

  it("labels a numeric token with its value and any other token with its name", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-size",
      tokenRow: tokenRow(),
      domElement: selected.domElement,
      entries: [FONT_SIZE],
    }));
    expect(handle.host.querySelector(".token-chip__label")?.textContent).toBe(FONT_SIZE.value.replace("px", ""));
    handle.unmount();

    handle = mount(createElement(TokenField, {
      property: "color",
      tokenRow: {
        property: "color",
        tokenName: COLOR_PRIMARY.name,
        declaredValue: `var(${COLOR_PRIMARY.name})`,
        resolvedValue: COLOR_PRIMARY.value,
        capability: "atomic",
        confidence: "exact",
        evidence: { reason: "test fixture" },
      },
      domElement: selected.domElement,
      entries: [COLOR_PRIMARY],
    }));
    expect(handle.host.querySelector(".token-chip__label")?.textContent).toBe(COLOR_PRIMARY.name);
  });

  it("puts the field icon inside the chip, outside the picker trigger", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-size",
      tokenRow: tokenRow(),
      domElement: selected.domElement,
      entries: [FONT_SIZE],
      leading: createElement("span", { "data-test": "field-icon" }),
    }));

    const chip = handle.host.querySelector(".token-chip") as HTMLElement;
    const picker = handle.host.querySelector('[data-test="token-chip"]') as HTMLButtonElement;
    const icon = handle.host.querySelector('[data-test="field-icon"]') as HTMLElement;
    expect(chip.contains(icon)).toBe(true);
    expect(picker.contains(icon)).toBe(false);
  });

  it("opens the token picker when the field icon is clicked", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-size",
      tokenRow: tokenRow(),
      domElement: selected.domElement,
      entries: [FONT_SIZE],
      leading: createElement("span", { "data-test": "field-icon" }),
    }));
    expect(document.querySelector('[data-test="token-chip-search"]')).toBeNull();

    act(() => (handle.host.querySelector('[data-test="field-icon"]') as HTMLElement).click());

    expect(document.querySelector('[data-test="token-chip-search"]')).not.toBeNull();
  });

  it("promotes a matching raw-value suggestion into a token chip", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-size",
      domElement: selected.domElement,
      entries: [FONT_SIZE],
    }));

    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    act(() => input.focus());
    const suggestion = document.querySelector('[data-test="suggestion-item"]') as HTMLElement;

    act(() => suggestion.click());

    expect(sheetText()).toContain("font-size: var(--font-size-base);");
    expect(handle.host.querySelector('[data-test="token-chip"]')?.textContent).toBe("16");
  });

  it("always renders a native picker for a raw color and commits its value", () => {
    const onCommitRaw = vi.fn();
    const { selected } = makeSelected();
    handle = mount(createElement(TokenValueField, {
      property: "--color-brand",
      committedValue: "#112233",
      resolvedValue: "#112233",
      entries: [],
      isColor: true,
      color: { hasEmbeddedAlpha: false, isExpression: false, opacityEditable: true },
      onCommitOpacity: vi.fn(),
      onCommitRaw,
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));
    const trigger = handle.host.querySelector('[data-test="token-color-input"]') as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-color-swatch"]')).not.toBeNull();
    expect((handle.host.querySelector('[data-test="color-opacity-input"]') as HTMLInputElement).value).toBe("100%");
    act(() => trigger.click());
    const hex = document.querySelector('[data-test="color-picker-hex"]') as HTMLInputElement;
    expect(hex.value).toBe("112233");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(hex, "abcdef");
      hex.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => hex.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onCommitRaw).toHaveBeenCalledWith("#abcdef");
    selected.domElement.remove();
  });

  it("uses the resolved color for a token swatch instead of its authored alias", () => {
    const onCommitRaw = vi.fn();
    const { selected } = makeSelected();
    handle = mount(createElement(TokenValueField, {
      property: "color",
      committedValue: "var(--color-error)",
      resolvedValue: "rgb(220, 38, 38)",
      activeTokenName: "--color-error",
      entries: [{ name: "--color-error", value: "var(--color-danger)", source: "fixture.css:1" }],
      isColor: true,
      onCommitRaw,
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));

    expect(handle.host.querySelector('[data-test="token-color-swatch"]')?.getAttribute("style"))
      .toContain("--swatch-color: rgb(220, 38, 38)");
    expect((handle.host.querySelector('[data-test="color-opacity-input"]') as HTMLInputElement).value).toBe("100%");
    selected.domElement.remove();
  });

  it("hides the default opacity when a token contains an alpha channel", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenValueField, {
      property: "color",
      committedValue: "var(--color-muted)",
      resolvedValue: "rgba(37, 99, 235, 0.5)",
      activeTokenName: "--color-muted",
      entries: [{ name: "--color-muted", value: "rgba(37, 99, 235, 0.5)", source: "fixture.css:1" }],
      isColor: true,
      onCommitOpacity: vi.fn(),
      onCommitRaw: vi.fn(),
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));

    expect(handle.host.querySelector('[data-test="color-opacity-input"]')).toBeNull();
    selected.domElement.remove();
  });

  it("hides the default opacity for a token-attributed color expression without alpha", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenValueField, {
      property: "background-color",
      committedValue: "color-mix(in srgb, var(--color-primary), white)",
      resolvedValue: "rgb(128, 128, 128)",
      entries: [],
      isColor: true,
      attributionTokens: ["--color-primary"],
      onCommitOpacity: vi.fn(),
      onCommitRaw: vi.fn(),
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));

    expect(handle.host.querySelector('[data-test="color-opacity-input"]')).toBeNull();
    selected.domElement.remove();
  });

  it("shows and commits a resolved opacity value beside a raw color", () => {
    const onCommitOpacity = vi.fn();
    const { selected } = makeSelected();
    handle = mount(createElement(TokenValueField, {
      property: "background-color",
      committedValue: "rgba(0, 0, 0, 0.8)",
      resolvedValue: "rgba(0, 0, 0, 0.8)",
      entries: [],
      isColor: true,
      opacity: { value: "80%", authoredValue: "0.8", source: "rgb", tokenName: null },
      onCommitOpacity,
      onCommitRaw: vi.fn(),
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));

    const opacityInput = handle.host.querySelector('[data-test="color-opacity-input"]') as HTMLInputElement;
    expect(opacityInput.value).toBe("80%");
    expect(opacityInput.getAttribute("aria-label")).toBe("Opacity for background-color");

    act(() => {
      opacityInput.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(opacityInput, "40%");
      opacityInput.dispatchEvent(new Event("change", { bubbles: true }));
      opacityInput.blur();
    });

    expect(onCommitOpacity).toHaveBeenCalledWith("40%");
    selected.domElement.remove();
  });

  it("restores the committed opacity when the semantic edit is unsupported", () => {
    const onCommitOpacity = vi.fn(() => false);
    handle = mount(createElement(TokenValueField, {
      property: "color",
      committedValue: "#ff0000",
      resolvedValue: "#ff0000",
      entries: [],
      isColor: true,
      color: { hasEmbeddedAlpha: false, isExpression: false, opacityEditable: true },
      onCommitOpacity,
      onCommitRaw: vi.fn(),
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));

    const opacityInput = handle.host.querySelector('[data-test="color-opacity-input"]') as HTMLInputElement;
    act(() => {
      opacityInput.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(opacityInput, "50%");
      opacityInput.dispatchEvent(new Event("change", { bubbles: true }));
      opacityInput.blur();
    });

    expect(onCommitOpacity).toHaveBeenCalledWith("50%");
    expect(opacityInput.value).toBe("100%");
  });

  it("reads a bare typed opacity as a percent", () => {
    const onCommitOpacity = vi.fn();
    handle = mount(createElement(TokenValueField, {
      property: "color",
      committedValue: "#ff0000",
      resolvedValue: "#ff0000",
      entries: [],
      isColor: true,
      color: { hasEmbeddedAlpha: false, isExpression: false, opacityEditable: true },
      onCommitOpacity,
      onCommitRaw: vi.fn(),
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));

    const opacityInput = handle.host.querySelector('[data-test="color-opacity-input"]') as HTMLInputElement;
    act(() => {
      opacityInput.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(opacityInput, "25");
      opacityInput.dispatchEvent(new Event("change", { bubbles: true }));
      opacityInput.blur();
    });

    expect(onCommitOpacity).toHaveBeenCalledWith("25%");
    expect(opacityInput.value).toBe("25%");
  });

  it("nudges opacity by one percent, or ten percent with Shift", () => {
    const onCommitOpacity = vi.fn();
    const { selected } = makeSelected();
    handle = mount(createElement(TokenValueField, {
      property: "background-color",
      committedValue: "rgba(0, 0, 0, 0.8)",
      resolvedValue: "rgba(0, 0, 0, 0.8)",
      entries: [],
      isColor: true,
      opacity: { value: "80%", authoredValue: "0.8", source: "rgb", tokenName: null },
      onCommitOpacity,
      onCommitRaw: vi.fn(),
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));

    const opacityInput = handle.host.querySelector('[data-test="color-opacity-input"]') as HTMLInputElement;
    act(() => {
      opacityInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    });
    expect(opacityInput.value).toBe("81%");
    expect(onCommitOpacity).toHaveBeenLastCalledWith("81%");

    act(() => {
      opacityInput.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowDown",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });
    expect(opacityInput.value).toBe("71%");
    expect(onCommitOpacity).toHaveBeenLastCalledWith("71%");
    selected.domElement.remove();
  });

  it("uses the opaque RGB portion of alpha hex values for the native color input", () => {
    expect(colorValueToHex("#ff000088")).toBe("#ff0000");
    expect(colorValueToHex("#f008")).toBe("#ff0000");
  });

  it("tags color-resolution probe elements so the cascade observer ignores them", () => {
    const appended: Element[] = [];
    const originalAppend = document.body.appendChild.bind(document.body);
    const spy = vi.spyOn(document.body, "appendChild").mockImplementation((node: Node) => {
      appended.push(node as Element);
      return originalAppend(node);
    });
    try {
      // A non-hex color forces the document probe path in colorValueToHex.
      colorValueToHex("oklch(63% .2 25)");
    } finally {
      spy.mockRestore();
    }
    expect(appended.length).toBeGreaterThan(0);
    for (const probe of appended) {
      expect(probe.getAttribute("data-nudge-ui")).toBe("value-probe");
    }
  });

  it("renders browser-supported oklch values instead of the unresolved fallback", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenValueField, {
      property: "color",
      committedValue: "oklch(63% .2 25)",
      resolvedValue: "oklch(63% .2 25)",
      entries: [],
      isColor: true,
      onCommitRaw: vi.fn(),
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));

    expect(handle.host.querySelector(".token-color-control")?.getAttribute("data-resolved")).toBe("true");
    expect(handle.host.querySelector('[data-test="token-color-swatch"]')?.getAttribute("style"))
      .toContain("oklch(63% .2 25)");
    selected.domElement.remove();
  });
});

describe("TokenField system fonts", () => {
  let handle: MountHandle;
  let target: HTMLElement;

  function fontSource(access: SystemFontAccess, families = ["Georgia", "Helvetica Neue", "Avenir Next", ".SF NS"]) {
    const source = {
      access: vi.fn(async () => access),
      families: vi.fn(async () => families),
    } satisfies SystemFontSource;
    configureSystemFontSource(source);
    return source;
  }

  function mountFontFamily(overrides: Record<string, unknown> = {}) {
    const { selected } = makeSelected();
    target = selected.domElement;
    handle = mount(createElement(TokenField, {
      property: "font-family",
      tokenRow: {
        property: "font-family",
        tokenName: null,
        declaredValue: "Inter, sans-serif",
        authored: "Inter, sans-serif",
        resolvedValue: "Inter, sans-serif",
        capability: "composite",
        confidence: "unknown",
        evidence: { reason: "test fixture" },
      },
      domElement: selected.domElement,
      entries: [],
      ...overrides,
    }));
    return handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;
  }

  async function settle(): Promise<void> {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function familyLabels(): string[] {
    return Array.from(document.body.querySelectorAll<HTMLElement>('[data-test="system-font-item"] .popover-listbox__label'))
      .map((item) => item.textContent ?? "");
  }

  function type(input: HTMLInputElement, value: string): void {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  beforeEach(() => {
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("nudge-ui-styles")?.remove();
    mockComputedStyle({ "font-family": "Inter, sans-serif" });
  });

  afterEach(() => {
    handle?.unmount();
    configureSystemFontSource(null);
    restoreComputedStyle();
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("nudge-ui-styles")?.remove();
  });

  it("asks before listing fonts and keeps the list open while they load", async () => {
    const source = fontSource("prompt");
    const input = mountFontFamily();
    expect(source.access).not.toHaveBeenCalled();

    act(() => input.focus());
    await settle();
    const request = document.body.querySelector<HTMLElement>('[data-test="system-fonts-request"]');
    expect(request?.textContent).toContain("Show system fonts");
    expect(source.families).not.toHaveBeenCalled();

    act(() => request!.click());
    await settle();

    expect(source.families).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('[data-test="system-fonts-request"]')).toBeNull();
    expect(familyLabels()).toEqual(["Avenir Next", "Georgia", "Helvetica Neue"]);
    expect(document.body.querySelector(".popover-listbox__group-label")?.textContent).toBe("System fonts");
    expect(input.value).toBe("Inter");
    expect(getChangeRecords()).toHaveLength(0);
  });

  it("lists every family until the user types, then filters them", async () => {
    fontSource("granted");
    const input = mountFontFamily();

    act(() => input.focus());
    await settle();
    expect(familyLabels()).toEqual(["Avenir Next", "Georgia", "Helvetica Neue"]);

    type(input, "neue");
    expect(familyLabels()).toEqual(["Helvetica Neue"]);
  });

  function chooseFamily(name: string): void {
    const item = Array.from(document.body.querySelectorAll<HTMLElement>('[data-test="system-font-item"]'))
      .find((candidate) => candidate.querySelector(".popover-listbox__label")?.textContent === name);
    act(() => item!.click());
  }

  it("commits a chosen family as a CSS family name and shows it in the field", async () => {
    fontSource("granted");
    const input = mountFontFamily();

    act(() => input.focus());
    await settle();
    chooseFamily("Helvetica Neue");

    expect(sheetText()).toContain('font-family: "Helvetica Neue";');
    expect(input.value).toBe('"Helvetica Neue"');
  });

  it("keeps the family name in the field when the applied family is chosen again", async () => {
    fontSource("granted");
    const input = mountFontFamily({
      tokenRow: {
        property: "font-family",
        tokenName: null,
        declaredValue: "Georgia",
        authored: "Georgia",
        resolvedValue: "Georgia",
        capability: "composite",
        confidence: "unknown",
        evidence: { reason: "test fixture" },
      },
    });

    act(() => input.focus());
    await settle();
    chooseFamily("Georgia");
    expect(input.value).toBe("Georgia");

    act(() => input.blur());
    act(() => input.focus());
    await settle();
    expect(familyLabels()).toEqual(["Avenir Next", "Georgia", "Helvetica Neue"]);
  });

  it("offers the request again after the list fails to load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const source = fontSource("prompt");
    source.families.mockRejectedValueOnce(new Error("The font list did not respond."));
    const input = mountFontFamily();

    act(() => input.focus());
    await settle();
    act(() => document.body.querySelector<HTMLElement>('[data-test="system-fonts-request"]')!.click());
    await settle();
    const retry = document.body.querySelector<HTMLElement>('[data-test="system-fonts-request"]');
    expect(retry?.textContent).toContain("Show system fonts");

    act(() => retry!.click());
    await settle();
    expect(familyLabels()).toEqual(["Avenir Next", "Georgia", "Helvetica Neue"]);
    warn.mockRestore();
  });

  it("hides the request once the browser refuses it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const source = fontSource("prompt");
    source.families.mockRejectedValueOnce(new DOMException("Permission denied.", "NotAllowedError"));
    source.access.mockResolvedValueOnce("prompt").mockResolvedValueOnce("denied");
    const input = mountFontFamily();

    act(() => input.focus());
    await settle();
    act(() => document.body.querySelector<HTMLElement>('[data-test="system-fonts-request"]')!.click());
    await settle();

    expect(document.body.querySelector('[data-test="system-fonts-request"]')).toBeNull();
    expect(familyLabels()).toEqual([]);
    warn.mockRestore();
  });

  it("offers system fonts beside the tokens in a token chip picker", async () => {
    fontSource("granted");
    const body: TokenEntry = { name: "--font-body", value: "Inter, sans-serif", source: "styles.css:1" };
    mountFontFamily({
      tokenRow: {
        property: "font-family",
        tokenName: body.name,
        declaredValue: `var(${body.name})`,
        resolvedValue: body.value,
        confidence: "exact",
        evidence: { reason: "test fixture" },
      },
      entries: [body],
    });

    act(() => (handle.host.querySelector('[data-test="token-chip"]') as HTMLButtonElement).click());
    await settle();

    expect(familyLabels()).toEqual(["Avenir Next", "Georgia", "Helvetica Neue"]);
    const search = document.body.querySelector('[data-test="token-chip-search"]') as HTMLInputElement;
    type(search, "geo");
    expect(familyLabels()).toEqual(["Georgia"]);
  });

  it("previews the family under the arrow keys and restores the element when the list closes", async () => {
    fontSource("granted");
    const input = mountFontFamily();
    const preview = () => document.getElementById("nudge-ui-value-preview")?.textContent ?? null;
    const press = (key: string) => act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });

    act(() => input.focus());
    await settle();
    expect(target.hasAttribute("data-nudge-ui-value-preview")).toBe(false);

    press("ArrowDown");
    const highlighted = document.body.querySelector("[data-highlighted] .popover-listbox__label")?.textContent;
    expect(highlighted).toBe("Avenir Next");
    expect(target.hasAttribute("data-nudge-ui-value-preview")).toBe(true);
    expect((document.getElementById("nudge-ui-value-preview") as HTMLStyleElement).sheet?.cssRules[0]?.cssText)
      .toContain('font-family: "Avenir Next" !important');
    expect(input.value).toBe("Inter");
    expect(getChangeRecords()).toHaveLength(0);

    press("Escape");
    expect(target.hasAttribute("data-nudge-ui-value-preview")).toBe(false);
    expect(preview()).toBeNull();
    expect(getChangeRecords()).toHaveLength(0);
  });

  it("leaves another field's preview in place when a font family field mounts or unmounts", async () => {
    fontSource("granted");
    const input = mountFontFamily();
    const previewed = target;
    act(() => input.focus());
    await settle();
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });
    expect(previewed.hasAttribute("data-nudge-ui-value-preview")).toBe(true);

    const other = makeSelected();
    const otherHandle = mount(createElement(TokenField, {
      property: "font-family",
      domElement: other.selected.domElement,
      entries: [],
    }));
    expect(previewed.hasAttribute("data-nudge-ui-value-preview")).toBe(true);
    otherHandle.unmount();
    expect(previewed.hasAttribute("data-nudge-ui-value-preview")).toBe(true);
  });

  it("shows nothing when the browser cannot list fonts", async () => {
    const source = fontSource("unavailable");
    const input = mountFontFamily();

    act(() => input.focus());
    await settle();

    expect(source.access).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('[data-test="system-fonts-request"]')).toBeNull();
    expect(familyLabels()).toEqual([]);
  });

  it("does not check font access for other properties", async () => {
    const source = fontSource("granted");
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-size",
      domElement: selected.domElement,
      entries: [],
    }));

    act(() => (handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).focus());
    await settle();

    expect(source.access).not.toHaveBeenCalled();
  });
});

describe("TokenField draft ownership", () => {
  let handle: MountHandle | null = null;

  afterEach(() => {
    handle?.unmount();
    handle = null;
  });

  function typeRaw(input: HTMLInputElement, value: string): void {
    act(() => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("does not write an untouched field on blur", () => {
    const { selected } = makeSelected();
    const onCommitRaw = vi.fn();
    handle = mount(createElement(TokenValueField, {
      property: "padding-top",
      domElement: selected.domElement,
      committedValue: "16px",
      entries: [],
      onCommitRaw,
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));
    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;

    act(() => input.focus());
    act(() => input.blur());

    expect(onCommitRaw).not.toHaveBeenCalled();
  });

  it("commits a typed raw value as one undoable edit", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "padding-top": "16px" });
    handle = mount(createElement(TokenField, {
      property: "padding-top",
      domElement: selected.domElement,
      entries: [],
    }));
    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;

    typeRaw(input, "32px");
    act(() => input.blur());

    expect(getChangeRecords()).toMatchObject([{ property: "padding-top", rawValue: "32px" }]);
    act(() => { expect(undo()).toBe(true); });
    expect(getChangeRecords()).toEqual([]);
    act(() => { expect(redo()).toBe(true); });
    expect(getChangeRecords()).toMatchObject([{ property: "padding-top", rawValue: "32px" }]);
  });

  it("keeps a typed raw value when the committed value changes underneath", () => {
    const { selected } = makeSelected();
    const onCommitRaw = vi.fn();
    const render = (committedValue: string) => createElement(TokenValueField, {
      property: "padding-top",
      domElement: selected.domElement,
      committedValue,
      entries: [],
      onCommitRaw,
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    });
    handle = mount(render("16px"));
    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;

    typeRaw(input, "32px");
    act(() => handle!.root.render(render("24px")));

    expect(input.value).toBe("32px");
    act(() => input.blur());
    expect(onCommitRaw).toHaveBeenLastCalledWith("32px");
  });

  it("accepts a committed value change when the user has not edited", () => {
    const { selected } = makeSelected();
    const onCommitRaw = vi.fn();
    const render = (committedValue: string) => createElement(TokenValueField, {
      property: "padding-top",
      domElement: selected.domElement,
      committedValue,
      entries: [],
      onCommitRaw,
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    });
    handle = mount(render("16px"));
    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;

    act(() => handle!.root.render(render("24px")));

    expect(input.value).toBe("24px");
  });

  it("drops a typed raw value when the target element changes", () => {
    const { el: first } = makeSelected("First");
    const { el: second } = makeSelected("Second");
    const onCommitRaw = vi.fn();
    const render = (el: HTMLElement, committedValue: string) => createElement(TokenValueField, {
      property: "padding-top",
      domElement: el,
      committedValue,
      entries: [],
      onCommitRaw,
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    });
    handle = mount(render(first, "16px"));
    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;

    typeRaw(input, "32px");
    act(() => handle!.root.render(render(second, "24px")));

    expect(input.value).toBe("24px");
    act(() => input.blur());
    expect(onCommitRaw).not.toHaveBeenCalled();
  });

  it("commits nothing when an untouched field blurs", () => {
    const { selected } = makeSelected();
    const onCommitRaw = vi.fn();
    handle = mount(createElement(TokenValueField, {
      property: "padding-top",
      domElement: selected.domElement,
      committedValue: "16px",
      entries: [],
      onCommitRaw,
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));
    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;

    act(() => input.focus());
    act(() => input.blur());
    expect(onCommitRaw).not.toHaveBeenCalled();
  });

  it("does not write back a background change when a focused, untouched field blurs", () => {
    const { selected } = makeSelected();
    const onCommitRaw = vi.fn();
    const render = (committedValue: string) => createElement(TokenValueField, {
      property: "padding-top",
      domElement: selected.domElement,
      committedValue,
      entries: [],
      onCommitRaw,
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    });
    handle = mount(render("16px"));
    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;

    act(() => input.focus());
    act(() => handle!.root.render(render("24px")));
    expect(input.value).toBe("24px");
    act(() => input.blur());
    expect(onCommitRaw).not.toHaveBeenCalled();
  });

  it("drops a typed raw value when the selection grows around the same primary element", () => {
    const { el: first } = makeSelected("First");
    const { el: second } = makeSelected("Second");
    const onCommitRaw = vi.fn();
    const render = (resetKey: readonly HTMLElement[]) => createElement(TokenValueField, {
      property: "padding-top",
      domElement: first,
      resetKey,
      committedValue: "16px",
      entries: [],
      onCommitRaw,
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    });
    handle = mount(render([first]));
    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;

    typeRaw(input, "32px");
    // A rebuilt list of the same elements is the same target and keeps the draft.
    act(() => handle!.root.render(render([first])));
    expect(input.value).toBe("32px");
    act(() => handle!.root.render(render([first, second])));
    expect(input.value).toBe("16px");
    act(() => input.blur());
    expect(onCommitRaw).not.toHaveBeenCalled();
  });

  it("commits nothing when an untouched opacity blurs", () => {
    const { selected } = makeSelected();
    const onCommitOpacity = vi.fn();
    handle = mount(createElement(TokenValueField, {
      property: "color",
      committedValue: "#ff0000",
      resolvedValue: "#ff0000",
      domElement: selected.domElement,
      entries: [],
      isColor: true,
      color: { hasEmbeddedAlpha: false, isExpression: false, opacityEditable: true },
      opacity: { value: "80%", authoredValue: "0.8", source: "rgb", tokenName: null },
      onCommitOpacity,
      onCommitRaw: vi.fn(),
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));
    const input = handle.host.querySelector('[data-test="color-opacity-input"]') as HTMLInputElement;

    act(() => input.focus());
    act(() => input.blur());
    expect(onCommitOpacity).not.toHaveBeenCalled();
  });

  it("reverts a typed opacity on Escape without committing", () => {
    const { selected } = makeSelected();
    const onCommitOpacity = vi.fn();
    handle = mount(createElement(TokenValueField, {
      property: "color",
      committedValue: "#ff0000",
      resolvedValue: "#ff0000",
      domElement: selected.domElement,
      entries: [],
      isColor: true,
      color: { hasEmbeddedAlpha: false, isExpression: false, opacityEditable: true },
      opacity: { value: "80%", authoredValue: "0.8", source: "rgb", tokenName: null },
      onCommitOpacity,
      onCommitRaw: vi.fn(),
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));
    const input = handle.host.querySelector('[data-test="color-opacity-input"]') as HTMLInputElement;

    act(() => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "40%");
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });

    expect(input.value).toBe("80%");
    expect(onCommitOpacity).not.toHaveBeenCalled();
  });

  it("keeps a typed opacity when the committed opacity changes underneath", () => {
    const { selected } = makeSelected();
    const onCommitOpacity = vi.fn();
    const render = (opacityValue: string) => createElement(TokenValueField, {
      property: "color",
      committedValue: "#ff0000",
      resolvedValue: "#ff0000",
      domElement: selected.domElement,
      entries: [],
      isColor: true,
      color: { hasEmbeddedAlpha: false, isExpression: false, opacityEditable: true },
      opacity: { value: opacityValue, authoredValue: "1", source: "rgb", tokenName: null },
      onCommitOpacity,
      onCommitRaw: vi.fn(),
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    });
    handle = mount(render("80%"));
    const input = handle.host.querySelector('[data-test="color-opacity-input"]') as HTMLInputElement;

    act(() => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "40%");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => handle!.root.render(render("60%")));

    expect(input.value).toBe("40%");
    act(() => input.blur());
    expect(onCommitOpacity).toHaveBeenLastCalledWith("40%");
  });
});
