// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { ComponentContract } from "../componentSemantics/types.ts";
import { VARIANT_ATTRIBUTE, variantAttributeValue, variantTokensForProps } from "../componentSemantics/variantMarkers.ts";
import { initialVariantChoice, variantChoicesForCell } from "./variantScopeState.ts";

const plainButton: ComponentContract = {
  componentId: "src/Button#Button",
  name: "Button",
  file: "src/Button.tsx",
  provenance: "typescript",
  props: [{ name: "label", control: "text", options: [], optional: false }],
};

const dsButton: ComponentContract = {
  componentId: "src/ds/Button#Button",
  name: "Button",
  file: "src/ds/Button.tsx",
  provenance: "typescript",
  props: [
    { name: "variant", control: "select", options: ["primary", "critical"], optional: true },
    { name: "size", control: "select", options: ["sm", "md"], optional: true },
    { name: "loading", control: "boolean", options: [], optional: true, defaultValue: false },
  ],
};

function sheetCell(contract: ComponentContract, props: Record<string, unknown>): HTMLElement {
  const sheet = document.createElement("main");
  sheet.setAttribute("data-nudge-ui-component-sheet", contract.componentId);
  const cell = document.createElement("div");
  cell.setAttribute("data-nudge-ui-sheet-cell", "");
  cell.setAttribute(VARIANT_ATTRIBUTE, variantAttributeValue(variantTokensForProps(contract, props)));
  sheet.append(cell);
  document.body.append(sheet);
  return cell;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("variantChoicesForCell", () => {
  it("reads the sheet's own contract when another component shares its name", () => {
    const cell = sheetCell(dsButton, { variant: "critical", size: "sm" });
    const choices = variantChoicesForCell(cell, [plainButton, dsButton], "Button");
    expect(choices.map((choice) => choice.label)).toEqual(["All Buttons", "variant: critical", "size: sm", "critical · sm"]);
  });

  it("defaults to the cell's whole combination", () => {
    const cell = sheetCell(dsButton, { variant: "critical", size: "sm" });
    const initial = initialVariantChoice(variantChoicesForCell(cell, [plainButton, dsButton], "Button"));
    expect(initial?.id).toBe("combination");
    expect(initial?.scope).toEqual({ componentName: "Button", props: { variant: "critical", size: "sm" } });
  });

  it("keeps a state prop column out of the default column's combination", () => {
    const loading = sheetCell(dsButton, { variant: "critical", size: "sm", loading: true });
    const loadingCombination = initialVariantChoice(variantChoicesForCell(loading, [dsButton], "Button"));
    expect(loadingCombination?.label).toBe("critical · sm · loading");
    expect(loadingCombination?.scope?.props).toEqual({ variant: "critical", size: "sm", loading: true });
    const base = sheetCell(dsButton, { variant: "critical", size: "sm", loading: false });
    expect(initialVariantChoice(variantChoicesForCell(base, [dsButton], "Button"))?.scope?.props)
      .toEqual({ variant: "critical", size: "sm" });
  });

  it("defaults to every variant when the cell has no variant axis", () => {
    const cell = sheetCell(plainButton, { label: "Label" });
    expect(initialVariantChoice(variantChoicesForCell(cell, [plainButton, dsButton], "Button"))?.id).toBe("all");
  });
});
