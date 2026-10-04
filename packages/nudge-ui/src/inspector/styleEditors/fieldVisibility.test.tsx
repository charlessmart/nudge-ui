// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { SpacingBox } from "./SpacingBox.tsx";
import { ColorPicker } from "./ColorPicker.tsx";
import { BoxShadowEditor } from "./BoxShadowEditor.tsx";
import { BorderEditor } from "./BorderEditor.tsx";
import { getBrowserCssInspection, disposeBrowserCssInspection } from "../inspection/browserCssInspectionRegistry.ts";
import { useBrowserCssInspection } from "../inspection/useBrowserCssInspection.ts";
import type { SelectedElement } from "../selection/selectionStore.ts";
import { createStyleSelection } from "../selection/styleSelection.ts";
import { setActiveStyleState } from "../shell/styleState.ts";
import { resetPendingRules } from "../tokens/editActions.ts";
import { makeSelected, mount, setInputValue, sheetText, type MountHandle } from "./_testUtils.ts";

let handle: MountHandle | undefined;
const styles: HTMLStyleElement[] = [];

function addCss(css: string): void {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  styles.push(style);
  getBrowserCssInspection().notifyStylesheetChange();
}

afterEach(() => {
  handle?.unmount();
  handle = undefined;
  resetPendingRules();
  setActiveStyleState("base");
  styles.splice(0).forEach((style) => style.remove());
  document.body.replaceChildren();
  disposeBrowserCssInspection(document);
});

describe("inspector field visibility", () => {
  it("keeps added spacing open after returning to zero and resets for another selection", () => {
    const { selected } = makeSelected();
    const other = makeSelected("Other").selected;
    addCss("* { padding: 0; }");
    const render = () => createElement(SpacingBox, { element: selected });
    handle = mount(render());
    act(() => handle!.host.querySelector<HTMLButtonElement>('[data-test="spacing-padding"] [data-test="add-value"]')!.click());
    const input = handle.host.querySelector<HTMLInputElement>('[data-property="padding-horizontal"] [data-test="raw-input"]')!;
    setInputValue(input, "8px");
    act(() => handle!.root.render(render()));
    setInputValue(input, "0px");
    act(() => handle!.root.render(render()));
    expect(handle.host.querySelector('[data-property="padding-horizontal"] [data-test="raw-input"]')).toBe(input);
    expect(input.value).toBe("0px");
    act(() => handle!.root.render(createElement(SpacingBox, { element: other })));
    expect(handle.host.querySelector('[data-test="spacing-padding"] [data-test="add-value"]')).not.toBeNull();
  });

  it("compacts zero spacing on reselection without discarding the pending edit", () => {
    const { selected } = makeSelected();
    const other = makeSelected("Other").selected;
    addCss('* { padding: 0; } [data-cid="Button"] { padding-left: 8px; padding-right: 8px; }');
    handle = mount(createElement(SpacingBox, { element: selected }));
    setInputValue(handle.host.querySelector<HTMLInputElement>('[data-property="padding-horizontal"] [data-test="raw-input"]')!, "0px");
    act(() => handle!.root.render(createElement(SpacingBox, { element: other })));
    act(() => handle!.root.render(createElement(SpacingBox, {
      element: selected,
      tokenRows: [...getBrowserCssInspection().inspect(selected.domElement).properties],
    })));
    expect(handle.host.querySelector('[data-test="spacing-padding"] [data-test="add-value"]')).not.toBeNull();
    expect(sheetText()).toContain("padding-left: 0px;");
  });

  it("keeps authored zero padding compact across a selection", () => {
    const first = makeSelected("Explicit").selected;
    const second = makeSelected("Default").selected;
    addCss('* { padding: 0; } [data-cid="Explicit"] { padding-inline: 0px; }');
    const inspection = getBrowserCssInspection();
    const snapshots = [inspection.inspect(first.domElement), inspection.inspect(second.domElement)];
    handle = mount(createElement(SpacingBox, {
      element: second,
      selection: createStyleSelection([first, second], snapshots, second),
    }));
    expect(handle.host.querySelector('[data-test="spacing-padding"] [data-test="add-value"]')).not.toBeNull();
    act(() => handle!.root.render(createElement(SpacingBox, {
      element: second, tokenRows: [...snapshots[1]!.properties],
    })));
    expect(handle.host.querySelector('[data-test="spacing-padding"] [data-test="add-value"]')).not.toBeNull();
  });

  it("keeps zero insets compact until opened", () => {
    const { selected } = makeSelected();
    addCss('[data-cid="Button"] { position: sticky; top: 0px; }');
    handle = mount(createElement(SpacingBox, { element: selected }));
    expect(handle.host.querySelector('[data-test="add-inset"]')).not.toBeNull();
    act(() => handle!.host.querySelector<HTMLButtonElement>('[data-test="add-inset"]')!.click());
    expect(handle.host.querySelector('[data-property="inset-vertical"] [data-test="raw-input"]')).not.toBeNull();
  });

  it("does not carry an inspected background into a transparent selection", () => {
    const colored = makeSelected("Colored").selected;
    const transparent = { ...colored, cid: "Transparent", domElement: document.createElement("nav") };
    document.body.appendChild(transparent.domElement);
    addCss('[data-cid="Colored"] { background-color: rgb(40, 80, 120); }');
    function InspectedBackground({ element }: { element: SelectedElement }) {
      const inspection = useBrowserCssInspection(element);
      return createElement(ColorPicker, {
        element,
        property: "background-color",
        tokenRow: inspection.element?.properties.find((row) => row.property === "background-color") ?? null,
      });
    }
    handle = mount(createElement(InspectedBackground, { element: colored }));
    expect(handle.host.querySelector('[data-test="raw-input"]')).not.toBeNull();
    act(() => handle!.root.render(createElement(InspectedBackground, { element: transparent })));
    expect(handle.host.querySelector('[data-test="raw-input"]')).toBeNull();
    expect(handle.host.querySelector('[data-test="add-color"]')).not.toBeNull();
  });

  it("keeps a background editable after its opacity reaches zero", () => {
    const { selected } = makeSelected();
    addCss('[data-cid="Button"] { background-color: rgb(40, 80, 120); }');
    const render = () => createElement(ColorPicker, {
      element: selected, property: "background-color",
      onAfterEdit: () => handle!.root.render(render()),
    });
    handle = mount(render());
    setInputValue(handle.host.querySelector<HTMLInputElement>('[data-test="raw-input"]')!, "transparent");
    expect(handle.host.querySelector<HTMLInputElement>('[data-test="raw-input"]')?.value).toBe("rgba(0, 0, 0, 0)");
    expect(handle.host.querySelector('[data-test="add-color"]')).toBeNull();
  });

  it("keeps a shadow editable after its opacity reaches zero", () => {
    const { selected } = makeSelected();
    addCss('[data-cid="Button"] { box-shadow: 0 2px 4px black; }');
    const render = () => createElement(BoxShadowEditor, {
      element: selected, onAfterEdit: () => handle!.root.render(render()),
    });
    handle = mount(render());
    setInputValue(handle.host.querySelector<HTMLInputElement>('[data-test="color-opacity-input"]')!, "0%");
    expect(handle.host.querySelector<HTMLInputElement>('[data-test="color-opacity-input"]')?.value).toBe("0%");
    expect(handle.host.querySelector('[data-test="shadow-0-0"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="add-shadow"]')).not.toBeNull();
  });

  it("keeps border controls compact for a group with only zero or none borders", () => {
    const first = makeSelected("Zero").selected;
    const second = makeSelected("None").selected;
    addCss('[data-cid="Zero"] { border: 0px solid red; } [data-cid="None"] { border: none; }');
    const inspection = getBrowserCssInspection();
    const snapshots = [inspection.inspect(first.domElement), inspection.inspect(second.domElement)];
    handle = mount(createElement(BorderEditor, {
      element: second,
      selection: createStyleSelection([first, second], snapshots, second),
    }));
    expect(handle.host.querySelector('[data-test="add-border"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="border-style-settings"]')).toBeNull();
  });

  it("keeps an authored zero border compact on initial selection", () => {
    const { selected } = makeSelected();
    addCss('[data-cid="Button"] { border: 0 solid; }');
    handle = mount(createElement(BorderEditor, {
      element: selected, tokenRows: [...getBrowserCssInspection().inspect(selected.domElement).properties],
    }));
    expect(handle.host.querySelector('[data-test="add-border"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="border-style-settings"]')).toBeNull();
  });
});
