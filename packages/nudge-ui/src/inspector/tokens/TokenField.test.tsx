// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { colorValueToHex, TokenField, TokenValueField } from "./TokenField.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import type { TokenEntry } from "../../css/model/index.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";
import { resetPendingRules, getChangeRecords } from "./editActions.ts";
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
  { clientX, pointerId = 1, shiftKey = false }: { clientX: number; pointerId?: number; shiftKey?: boolean },
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
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

  it("supports shared leading and trailing adornments", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(
      ControlSurface,
      { "data-test": "token-surface" },
      createElement(TokenField, {
        property: "font-size",
        domElement: selected.domElement,
        entries: [],
        leading: createElement("span", { "data-test": "leading-adornment" }, "A"),
        trailing: createElement("span", { "data-test": "trailing-adornment" }, "⌄"),
        label: "Font size",
      }),
    ));

    const field = handle.host.querySelector('[data-test="token-field"]') as HTMLElement;
    expect(field.querySelector('[data-test="leading-adornment"]')).not.toBeNull();
    expect(field.querySelector('[data-test="trailing-adornment"]')).not.toBeNull();
    expect(field.getAttribute("aria-label")).toBe("Font size");
    expect(field.className).not.toContain("control-surface");
    expect(handle.host.querySelector('[data-test="token-surface"]')?.className).toContain("control-surface");
    expect(field.querySelector('[data-test="raw-input"]')?.className).toContain("text-input--embedded");
  });

  it("does not create visual chrome when mounted without a parent surface", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "padding-top",
      domElement: selected.domElement,
      entries: [],
    }));

    const field = handle.host.querySelector('[data-test="token-field"]') as HTMLElement;
    expect(field.className).not.toContain("control-surface");
    expect(field.querySelector('[data-test="raw-input"]')?.className).toContain("text-input--embedded");
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

    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 104, pointerId: 7 })));

    expect((handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).value).toBe("20px");
    expect(sheetText()).toContain("padding-top: 20px;");

    act(() => dragHandle.dispatchEvent(pointerEvent("pointerup", { clientX: 104, pointerId: 7 })));
    expect(dragHandle.getAttribute("data-dragging")).toBeNull();
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(7);
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
    act(() => dragHandle.dispatchEvent(pointerEvent("pointermove", { clientX: 102, pointerId: 9, shiftKey: true })));

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
    expect(chip.textContent).toContain("--font-size-base");
    expect((handle.host.querySelector(".token-chip__label") as HTMLElement).title).toBe(FONT_SIZE.name);
    expect(handle.host.querySelector('[data-test="token-select"]')).toBeNull();
  });

  it("renders a compact numeric token value while keeping the token name in the tooltip", () => {
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
      chipVariant: "small",
    }));

    const chip = handle.host.querySelector('.token-chip') as HTMLElement;
    const label = chip.querySelector(".token-chip__label") as HTMLElement;
    expect(chip.classList).toContain("token-chip--small");
    expect(label.textContent).toBe("12");
    expect(label.title).toBe(radiusToken.name);
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
    expect(handle.host.querySelector('[data-test="token-chip"]')?.textContent).toContain("--font-size-base");
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
    const picker = handle.host.querySelector('[data-test="token-color-input"]') as HTMLInputElement;
    expect(picker).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-color-swatch"]')).not.toBeNull();
    expect((handle.host.querySelector('[data-test="color-opacity-input"]') as HTMLInputElement).value).toBe("100%");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(picker, "#abcdef");
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onCommitRaw).toHaveBeenCalledWith("#abcdef");
    expect(handle.host.querySelector('[data-test="token-field"]')?.classList.contains("token-field--color")).toBe(true);
    selected.domElement.remove();
  });

  it("uses the resolved hex for a token swatch instead of its authored alias", () => {
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
      .toContain("--swatch-color: #dc2626");
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
