import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { act } from "react";
import type { SelectedElement } from "../selection/selectionStore.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import { getManagedSheetText } from "../projection/managedStylesheet.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export function makeSelected(
  cid = "Button",
  src = "src/Button.tsx:1:1",
) {
  const el = document.createElement("button");
  el.setAttribute("data-cid", cid);
  el.setAttribute("data-src", src);
  document.body.appendChild(el);
  const selected: SelectedElement = {
    cid,
    src,
    cprops: null,
    file: src.split(":")[0]!,
    line: 1,
    column: 1,
    domElement: el,
    componentTargets: [],
  };
  return { el, selected };
}

export function makeMixedStyleSelection(
  selected: SelectedElement,
  property: string,
): StyleSelection {
  const selectedProperty = {
    property,
    value: { kind: "mixed" as const },
    token: { kind: "none" as const },
    primaryRow: null,
  };
  return {
    primary: selected,
    elements: [selected],
    domElements: [selected.domElement],
    target: selected.domElement,
    primaryRows: [],
    getProperty: (name) => name === property ? selectedProperty : null,
    supportsRole: () => false,
  };
}

export interface MountHandle {
  host: HTMLDivElement;
  root: Root;
  unmount: () => void;
}

export function mount(node: Parameters<Root["render"]>[0]): MountHandle {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return {
    host,
    root,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

export function mockComputedStyle(values: Record<string, string>): void {
  const stub = (el: Element): CSSStyleDeclaration => {
    const base = originalGetComputedStyle(el);
    const proxy: Partial<CSSStyleDeclaration> = {
      getPropertyValue: (prop: string): string => values[prop] ?? "",
    };
    return new Proxy(base, {
      get(target, key: string) {
        if (key === "getPropertyValue") return proxy.getPropertyValue;
        if (key in values) return values[key];
        const v = Reflect.get(target, key);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  };
  (window as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle = stub as typeof getComputedStyle;
}

const originalGetComputedStyle = window.getComputedStyle.bind(window);

export function restoreComputedStyle(): void {
  (window as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle = originalGetComputedStyle;
}

export function setInputValue(input: HTMLInputElement, value: string): void {
  act(() => {
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  act(() => input.blur());
}

export function setSelectValue(select: HTMLElement, value: string): void {
  act(() => {
    select.focus();
    select.click();
  });

  const option = Array.from(document.querySelectorAll<HTMLElement>(".select__item"))
    .find((item) => item.dataset.value === value);
  if (!option) {
    throw new Error(`Could not find select option ${value}`);
  }

  act(() => {
    option.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    option.click();
  });
}

export function selectOptionValues(select: HTMLElement): string[] {
  act(() => select.click());
  const values = Array.from(document.querySelectorAll<HTMLElement>(".select__item"))
    .map((item) => item.dataset.value)
    .filter((value): value is string => value !== undefined);
  act(() => select.click());
  return values;
}

export function sheetText(): string {
  return getManagedSheetText();
}
