// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { colorValueToHex, TokenField, TokenValueField } from "./TokenField.tsx";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "./resolution.ts";
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
    document.getElementById("design-tool-styles")?.remove();
    mockComputedStyle({ "font-size": "16px" });
  });

  afterEach(() => {
    handle?.unmount();
    restoreComputedStyle();
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("design-tool-styles")?.remove();
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
    handle = mount(createElement(TokenField, {
      property: "font-size",
      domElement: selected.domElement,
      entries: [],
      leading: createElement("span", { "data-test": "leading-adornment" }, "A"),
      trailing: createElement("span", { "data-test": "trailing-adornment" }, "⌄"),
      label: "Font size",
    }));

    const field = handle.host.querySelector('[data-test="token-field"]') as HTMLElement;
    expect(field.querySelector('[data-test="leading-adornment"]')).not.toBeNull();
    expect(field.querySelector('[data-test="trailing-adornment"]')).not.toBeNull();
    expect(field.getAttribute("aria-label")).toBe("Font size");
  });

  it.each([
    ["padding-top", "8", "8px"],
    ["font-size", "1", "1rem"],
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
    expect(handle.host.querySelector('[data-test="token-select"]')).toBeNull();
  });

  it("shows authored functional CSS and token attribution instead of computed pixels", () => {
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
    const attribution = handle.host.querySelector('[data-test="token-attribution"]') as HTMLElement;
    expect(rawInput.value).toBe("calc(var(--space-4) * 2)");
    expect(attribution.textContent).toContain("--space-4");
    expect(rawInput.compareDocumentPosition(attribution) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
      onCommitRaw,
      onSelectToken: vi.fn(),
      onUnlink: vi.fn(),
    }));
    const picker = handle.host.querySelector('[data-test="token-color-input"]') as HTMLInputElement;
    expect(picker).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-color-swatch"]')).not.toBeNull();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(picker, "#abcdef");
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onCommitRaw).toHaveBeenCalledWith("#abcdef");
    expect(handle.host.querySelector('[data-test="token-field"]')?.classList.contains("dt-token-field--color")).toBe(true);
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
      .toContain("--dt-swatch-color: #dc2626");
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

  it("uses the opaque RGB portion of alpha hex values for the native color input", () => {
    expect(colorValueToHex("#ff000088")).toBe("#ff0000");
    expect(colorValueToHex("#f008")).toBe("#ff0000");
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

    expect(handle.host.querySelector(".dt-token-color-control")?.getAttribute("data-resolved")).toBe("true");
    expect(handle.host.querySelector('[data-test="token-color-swatch"]')?.getAttribute("style"))
      .toContain("oklch(63% .2 25)");
    selected.domElement.remove();
  });
});
