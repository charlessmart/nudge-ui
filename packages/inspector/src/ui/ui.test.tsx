// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { FieldRow } from "./FieldRow.tsx";
import { TextInput } from "./TextInput.tsx";
import { Select } from "./Select.tsx";
import { Button } from "./Button.tsx";
import { IconButton } from "./IconButton.tsx";
import { StatusCallout } from "./StatusCallout.tsx";
import { Badge } from "./Badge.tsx";
import { Breadcrumb } from "./Breadcrumb.tsx";
import { ColorSwatch } from "./ColorSwatch.tsx";
import { PopoverListbox } from "./PopoverListbox.tsx";
import { SideValuesField, SIDE_NAMES } from "./SideValuesField.tsx";
import { ControlSurface } from "./ControlSurface.tsx";
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

  it("keeps standalone controls styled while embedded content defers its field chrome", () => {
    act(() => {
      root.render(createElement("div", null,
        createElement(TextInput, { "data-test": "standalone-input" }),
        createElement(Select, {
          value: "one",
          options: [{ value: "one", label: "One" }],
          "data-test": "standalone-select",
        }),
        createElement(ControlSurface, { "data-test": "surface" },
          createElement(TextInput, { appearance: "embedded", "data-test": "embedded-input" }),
          createElement(Select, {
            appearance: "embedded",
            value: "one",
            options: [{ value: "one", label: "One" }],
            "data-test": "embedded-select",
          }),
        ),
      ));
    });

    expect(host.querySelector('[data-test="surface"]')?.className).toContain("control-surface");
    expect(host.querySelector('[data-test="standalone-input"]')?.className).not.toContain("embedded");
    expect(host.querySelector('[data-test="standalone-select"]')?.className).not.toContain("embedded");
    expect(host.querySelector('[data-test="embedded-input"]')?.className).toContain("text-input--embedded");
    expect(host.querySelector('[data-test="embedded-select"]')?.className).toContain("select--embedded");
  });

  it("formats CSS property labels as title case words", () => {
    expect(formatInspectorLabel("font-size")).toBe("Font Size");
    expect(formatInspectorLabel("focus-visible")).toBe("Focus Visible");
    expect(formatInspectorLabel("border_radius")).toBe("Border Radius");
  });

  it("renders a Base UI select with a shared styling seam", () => {
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
    expect(select.className).toContain("select");

    act(() => select.click());
    const selectedItem = document.body.querySelector('[data-value="two"]') as HTMLElement;
    expect(selectedItem.firstElementChild?.className).toContain("select__item-text");
    expect(selectedItem.lastElementChild?.className).toContain("select__item-indicator");
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
    const selectedItem = document.body.querySelector('[data-value="red"]') as HTMLElement;
    expect(selectedItem.firstElementChild?.className).toContain("select__item-text");
    expect(selectedItem.lastElementChild?.className).toContain("select__item-indicator");

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

  it("gives actions and statuses semantic attributes", () => {
    act(() => {
      root.render(createElement("div", null,
        createElement(Button, { "data-test": "button" }, "Save"),
        createElement(IconButton, { label: "Close", "data-test": "icon" }, "×"),
        createElement(StatusCallout, { tone: "accent", "data-test": "accent-status" }, "Affects 3 rendered components/elements"),
        createElement(StatusCallout, { tone: "warning", "data-test": "status" }, "Preview blocked"),
        createElement(Badge, { tone: "accent", "data-test": "badge" }, "exact"),
      ));
    });

    expect(host.querySelector('[data-test="button"]')?.tagName).toBe("BUTTON");
    expect(host.querySelector('[data-test="icon"]')?.getAttribute("aria-label")).toBe("Close");
    expect(host.querySelector('[data-test="status"]')?.className).toContain("warning");
    expect(host.querySelector('[data-test="accent-status"]')?.className).toContain("accent");
    expect(host.querySelector('[data-test="badge"]')?.className).toContain("accent");
  });

  it("shares variants and sizing semantics between text and icon buttons", () => {
    act(() => {
      root.render(createElement("div", null,
        createElement(Button, { variant: "primary", size: "compact", "data-test": "text-primary" }, "Save"),
        createElement(IconButton, { variant: "secondary", label: "Add", "data-test": "icon-secondary" }, "+"),
        createElement(IconButton, { variant: "primary", size: "compact", label: "Save", "data-test": "icon-primary" }, "✓"),
        createElement(IconButton, { variant: "quiet", label: "More", "data-test": "icon-quiet" }, "⋯"),
        createElement(IconButton, { variant: "disabled", disabled: true, label: "Unavailable", "data-test": "icon-disabled" }, "–"),
      ));
    });

    expect(host.querySelector('[data-test="text-primary"]')?.className).toContain("button--primary");
    expect(host.querySelector('[data-test="icon-primary"]')?.className).toContain("icon-button--primary");
    expect(host.querySelector('[data-test="icon-primary"]')?.className).toContain("icon-button--compact");
    expect(host.querySelector('[data-test="icon-secondary"]')?.className).toContain("icon-button--secondary");
    expect(host.querySelector('[data-test="icon-quiet"]')?.className).toContain("icon-button--quiet");
    expect(host.querySelector('[data-test="icon-disabled"]')?.className).toContain("icon-button--disabled");
    expect((host.querySelector('[data-test="icon-disabled"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("provides a neutral disabled button variant", () => {
    act(() => {
      root.render(createElement(Button, {
        variant: "disabled",
        disabled: true,
        "data-test": "disabled-button",
      }, "No changes"));
    });

    const button = host.querySelector('[data-test="disabled-button"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.className).toContain("button--disabled");
  });

  it("renders an accessible breadcrumb and color swatch", () => {
    act(() => {
      root.render(createElement("div", null,
        createElement(Breadcrumb, {
          items: [{ id: "button", label: "Button", active: true, "data-test": "crumb" }],
          "data-test": "breadcrumb",
        }),
        createElement(ColorSwatch, { color: "#fff", "data-test": "swatch" }),
      ));
    });

    expect(host.querySelector("nav")?.getAttribute("aria-label")).toBe("Selection hierarchy");
    expect(host.querySelector('[data-test="crumb"]')?.getAttribute("aria-current")).toBe("location");
    expect(host.querySelector('[data-test="swatch"]')?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders Base UI combobox items with keyboard-ready semantics", () => {
    act(() => {
      root.render(createElement(PopoverListbox, {
        query: "--color",
        open: true,
        items: [{ value: "--color-brand", label: "--color-brand", "data-test": "suggestion" }],
        inputDataTest: "query",
        onQueryChange: () => undefined,
        onOpenChange: () => undefined,
        onSelect: () => undefined,
      }));
    });

    expect(host.querySelector('[data-test="query"]')).not.toBeNull();
    expect(document.body.querySelector('[data-test="suggestion"]')).not.toBeNull();
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

  it("renders four side values directly when no paired controls are given", () => {
    act(() => {
      root.render(createElement(SideValuesField, {
        label: "padding",
        "data-test": "side-values",
        sides: SIDE_NAMES.map((side) => ({
          side,
          control: createElement("span", { "data-test": `control-${side}` }, side),
        })),
      }));
    });

    expect(host.querySelectorAll('[data-test^="side-value-"]')).toHaveLength(4);
    expect(Array.from(host.querySelectorAll<HTMLElement>('[data-test^="side-value-"]'))
      .map((side) => side.getAttribute("data-side")))
      .toEqual(["left", "top", "right", "bottom"]);
    expect(host.querySelector('[data-side="top"] svg')).not.toBeNull();
    expect(host.querySelector('[data-side="top"]')?.className).toContain("control-surface");
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
    expect(field.querySelector('[data-test="individual-sides"]')?.className).toContain("toggle-button");
    expect(field.querySelector('[data-test="individual-sides"]')?.className).toContain("toggle-button--quiet");
    expect(field.querySelector('[data-test="individual-sides"]')?.getAttribute("aria-label")).toBe("Expand Padding Sides");

    act(() => (field.querySelector('[data-test="individual-sides"]') as HTMLButtonElement).click());
    expect(field.getAttribute("data-expanded")).toBe("true");
    expect(field.querySelectorAll('[data-test^="side-value-"]')).toHaveLength(4);
    expect(field.querySelector('[data-side="top"] svg')).not.toBeNull();

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
