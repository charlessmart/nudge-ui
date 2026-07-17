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
    expect(label?.textContent).toContain("Font size");
    expect(label?.querySelector('[data-test="font-size"]')).not.toBeNull();
  });

  it("keeps select behavior native while exposing a shared styling seam", () => {
    const onValueChange = (value: string) => value;
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

    const select = host.querySelector('[data-test="shared-select"]') as HTMLSelectElement;
    expect(select.value).toBe("two");
    expect(select.className).toContain("dt-select");
  });

  it("gives actions and statuses semantic attributes", () => {
    act(() => {
      root.render(createElement("div", null,
        createElement(Button, { "data-test": "button" }, "Save"),
        createElement(IconButton, { label: "Close", "data-test": "icon" }, "×"),
        createElement(StatusCallout, { tone: "warning", "data-test": "status" }, "Preview blocked"),
        createElement(Badge, { tone: "accent", "data-test": "badge" }, "exact"),
      ));
    });

    expect(host.querySelector('[data-test="button"]')?.tagName).toBe("BUTTON");
    expect(host.querySelector('[data-test="icon"]')?.getAttribute("aria-label")).toBe("Close");
    expect(host.querySelector('[data-test="status"]')?.className).toContain("warning");
    expect(host.querySelector('[data-test="badge"]')?.className).toContain("accent");
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
});
