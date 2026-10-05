// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { FieldRow } from "./FieldRow.tsx";
import { TextInput } from "./TextInput.tsx";
import { Select } from "./Select.tsx";
import { Disclosure } from "./Disclosure.tsx";
import { PopoverListbox } from "./PopoverListbox.tsx";
import { SideValuesField, SIDE_NAMES } from "./SideValuesField.tsx";
import { formatInspectorLabel } from "./labels.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("shared inspector UI", () => {
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

  it("associates a field label with its control by nesting the control", () => {
    act(() => {
      root.render(createElement(FieldRow, {
        label: "Font size",
        children: createElement(TextInput, { "data-test": "font-size" }),
      }));
    });

    const label = host.querySelector("label");
    expect(label?.textContent).toContain("Font Size");
    expect(label?.querySelector('[data-test="font-size"]')).not.toBeNull();
  });

  it("formats CSS property labels as title case words", () => {
    expect(formatInspectorLabel("font-size")).toBe("Font Size");
    expect(formatInspectorLabel("focus-visible")).toBe("Focus Visible");
    expect(formatInspectorLabel("border_radius")).toBe("Border Radius");
  });

  it("selects a value through the dropdown", () => {
    const onValueChange = vi.fn<(value: string) => void>();
    act(() => {
      root.render(createElement(Select, {
        value: "two",
        options: [
          { value: "one", label: "One" },
          { value: "two", label: "Two" },
        ],
        onValueChange,
        "data-test": "shared-select",
      }));
    });

    const select = host.querySelector('[data-test="shared-select"]') as HTMLElement;
    expect(select.tagName).toBe("BUTTON");
    expect(select.getAttribute("role")).toBe("combobox");
    expect(select.textContent).toContain("Two");

    act(() => select.click());
    act(() => {
      const option = document.body.querySelector('[data-value="one"]') as HTMLElement;
      option.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      option.click();
    });
    expect(onValueChange).toHaveBeenCalledWith("one");
  });

  it("renders a searchable select with grouped filtering", () => {
    const onValueChange = vi.fn<(value: string) => void>();
    act(() => {
      root.render(createElement(Select, {
        searchable: true,
        value: "red",
        groups: [
          {
            label: "Colors",
            options: [
              { value: "red", label: "Red" },
              { value: "blue", label: "Blue" },
            ],
          },
          {
            label: "Spacing",
            options: [{ value: "large", label: "Large" }],
          },
        ],
        searchPlaceholder: "Search values…",
        searchAriaLabel: "Filter values",
        onValueChange,
        "data-test": "searchable-select",
      }));
    });

    const trigger = host.querySelector('[data-test="searchable-select"]') as HTMLElement;
    expect(trigger.getAttribute("role")).toBe("combobox");

    act(() => trigger.click());

    const input = document.body.querySelector('[data-test="searchable-select-search"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.placeholder).toBe("Search values…");
    expect(input.getAttribute("aria-label")).toBe("Filter values");
    expect(Array.from(document.body.querySelectorAll<HTMLElement>(".select__item")).map((item) => item.dataset.value))
      .toEqual(["red", "blue", "large"]);

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "blue");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(Array.from(document.body.querySelectorAll<HTMLElement>(".select__item")).map((item) => item.dataset.value))
      .toEqual(["blue"]);
    expect(Array.from(document.body.querySelectorAll<HTMLElement>(".select__group-label")).map((label) => label.textContent))
      .toEqual(["Colors"]);

    act(() => {
      const option = document.body.querySelector('[data-value="blue"]') as HTMLElement;
      option.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      option.click();
    });
    expect(onValueChange).toHaveBeenCalledWith("blue");
  });

  it("toggles a disclosure with label semantics", () => {
    act(() => {
      root.render(createElement(Disclosure, {
        title: "Connection details",
        badge: createElement("span", { "data-test": "disclosure-count" }, "2"),
        "data-test": "disclosure",
        triggerDataTest: "disclosure-toggle",
        children: "Recovery content",
      }));
    });

    const disclosure = host.querySelector('[data-test="disclosure"]') as HTMLElement;
    const trigger = host.querySelector('[data-test="disclosure-toggle"]') as HTMLButtonElement;
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(disclosure.textContent).toContain("Recovery content");

    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("data-panel-open")).not.toBeNull();
  });

  it("selects a trigger combobox item with a pointer click", () => {
    const onSelect = vi.fn();
    act(() => {
      root.render(createElement(PopoverListbox, {
        query: "",
        open: true,
        trigger: createElement("span", null, "Current token"),
        items: [{ value: "--color-next", label: "--color-next", "data-test": "clickable-suggestion" }],
        onQueryChange: () => undefined,
        onOpenChange: () => undefined,
        onSelect,
      }));
    });

    act(() => {
      (document.body.querySelector('[data-test="clickable-suggestion"]') as HTMLElement).click();
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("--color-next");
  });

  it("filters a searchable trigger combobox from its popup input", () => {
    const onSelect = vi.fn();
    act(() => {
      root.render(createElement(PopoverListbox, {
        query: "",
        open: true,
        searchable: true,
        searchPlaceholder: "Search tokens…",
        searchAriaLabel: "Search tokens",
        trigger: createElement("span", null, "Current token"),
        triggerDataTest: "searchable-trigger",
        items: [
          { value: "--color-brand", label: "--color-brand", "data-test": "color-suggestion" },
          { value: "--space-large", label: "--space-large", "data-test": "space-suggestion" },
        ],
        onQueryChange: () => undefined,
        onOpenChange: () => undefined,
        onSelect,
      }));
    });

    const input = document.body.querySelector('[data-test="searchable-trigger-search"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.placeholder).toBe("Search tokens…");
    expect(input.getAttribute("aria-label")).toBe("Search tokens");
    expect(document.body.querySelector('[data-test="color-suggestion"]')).not.toBeNull();
    expect(document.body.querySelector('[data-test="space-suggestion"]')).not.toBeNull();

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "space");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(document.body.querySelector('[data-test="color-suggestion"]')).toBeNull();
    expect(document.body.querySelector('[data-test="space-suggestion"]')).not.toBeNull();

    act(() => {
      (document.body.querySelector('[data-test="space-suggestion"]') as HTMLElement).click();
    });
    expect(onSelect).toHaveBeenCalledWith("--space-large");
  });

  it("renders grouped side values and expands back to four sides", () => {
    act(() => {
      root.render(createElement(SideValuesField, {
        label: "padding",
        "data-test": "grouped-side-values",
        pairedControls: [
          { axis: "vertical", control: createElement("span", { "data-test": "vertical-control" }, "8px") },
          { axis: "horizontal", control: createElement("span", { "data-test": "horizontal-control" }, "12px") },
        ],
        sides: SIDE_NAMES.map((side) => ({
          side,
          control: createElement("span", { "data-test": `expanded-${side}` }, side),
        })),
      }));
    });

    const field = host.querySelector('[data-test="grouped-side-values"]') as HTMLElement;
    expect(field.getAttribute("data-expanded")).toBe("false");
    expect(field.querySelectorAll('[data-test^="pair-value-"]')).toHaveLength(2);
    expect(Array.from(field.querySelectorAll<HTMLElement>('[data-test^="pair-value-"]'))
      .map((pair) => pair.getAttribute("data-axis")))
      .toEqual(["horizontal", "vertical"]);
    expect(field.querySelectorAll('[data-test^="side-value-"]')).toHaveLength(0);
    expect(field.querySelector('[data-test="individual-sides"]')?.getAttribute("aria-label")).toBe("Expand Padding Sides");

    act(() => (field.querySelector('[data-test="individual-sides"]') as HTMLButtonElement).click());
    expect(field.getAttribute("data-expanded")).toBe("true");
    expect(field.querySelectorAll('[data-test^="side-value-"]')).toHaveLength(4);

    act(() => (field.querySelector('[data-test="individual-sides"]') as HTMLButtonElement).click());
    expect(field.getAttribute("data-expanded")).toBe("false");
    expect(field.querySelectorAll('[data-test^="pair-value-"]')).toHaveLength(2);
  });

  it("allows a default-expanded side field to collapse", () => {
    act(() => {
      root.render(createElement(SideValuesField, {
        label: "padding",
        "data-test": "forced-grouped-side-values",
        defaultExpanded: true,
        pairedControls: [
          { axis: "horizontal", control: createElement("span", null, "0px") },
          { axis: "vertical", control: createElement("span", null, "16px / 0px") },
        ],
        sides: SIDE_NAMES.map((side) => ({
          side,
          control: createElement("span", null, side),
        })),
      }));
    });

    const field = host.querySelector('[data-test="forced-grouped-side-values"]') as HTMLElement;
    const toggle = field.querySelector('[data-test="individual-sides"]') as HTMLButtonElement;
    expect(field.getAttribute("data-expanded")).toBe("true");
    expect(field.querySelectorAll('[data-test^="side-value-"]')).toHaveLength(4);
    expect(toggle.disabled).toBe(false);
    act(() => toggle.click());
    expect(field.getAttribute("data-expanded")).toBe("false");
    expect(field.querySelectorAll('[data-test^="pair-value-"]')).toHaveLength(2);
  });

  it("resets grouped mode immediately when the reset key changes", () => {
    const renderField = (resetKey: string, defaultExpanded: boolean) => root.render(createElement(SideValuesField, {
      label: "padding",
      "data-test": "resettable-grouped-side-values",
      resetKey,
      defaultExpanded,
      pairedControls: [
        { axis: "horizontal", control: createElement("span", null, "0px") },
        { axis: "vertical", control: createElement("span", null, "16px / 0px") },
      ],
      sides: SIDE_NAMES.map((side) => ({
        side,
        control: createElement("span", null, side),
      })),
    }));

    act(() => renderField("asymmetric", true));
    expect(host.querySelector('[data-test="resettable-grouped-side-values"]')?.getAttribute("data-expanded")).toBe("true");

    act(() => renderField("symmetric", false));
    const field = host.querySelector('[data-test="resettable-grouped-side-values"]') as HTMLElement;
    expect(field.getAttribute("data-expanded")).toBe("false");
    expect(field.querySelectorAll('[data-test^="pair-value-"]')).toHaveLength(2);
  });
});
