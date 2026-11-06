// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { ComponentContract } from "../inspector/componentSemantics/types.ts";
import { cellProps, planSheetColumns, planSheetLayout, planSheetRows, sheetVariantCount } from "./model.ts";
import {
  buildStateStyles,
  emptyStateSelectors,
  neutralizeStatePseudos,
  rewriteStateSelector,
  selectorStateUsage,
  statesUsedWithin,
  type RuleLike,
} from "./stateStyles.ts";

const button: ComponentContract = {
  componentId: "src/Button#Button",
  name: "Button",
  file: "src/Button.tsx",
  provenance: "typescript",
  props: [
    { name: "variant", control: "select", options: ["primary", "secondary"], optional: true },
    { name: "size", control: "select", options: ["small", "large"], optional: true },
    { name: "disabled", control: "boolean", options: [], optional: true },
    { name: "loading", control: "boolean", options: [], optional: true },
    { name: "children", control: "text", options: [], optional: true },
    { name: "aria", control: "text", options: [], optional: false },
  ],
};

describe("contract defaults", () => {
  const withDefaults: ComponentContract = {
    ...button,
    props: button.props.map((prop) =>
      prop.name === "variant" ? { ...prop, defaultValue: "secondary" }
        : prop.name === "disabled" ? { ...prop, defaultValue: true }
          : prop),
  };

  it("holds props beyond the row cap at their default", () => {
    const many: ComponentContract = {
      ...withDefaults,
      props: [
        { name: "variant", control: "select", options: ["a", "b", "c", "d", "e", "f"], optional: true, defaultValue: "c" },
        { name: "size", control: "select", options: ["s", "m", "l", "xl", "xxl", "xxxl"], optional: true },
      ],
    };
    const rows = planSheetRows(many);
    // 6 × 6 exceeds the cap, so only variant varies and size stays at its baseline.
    expect(rows.map((row) => row.props)).toEqual(["a", "b", "c", "d", "e", "f"].map((variant) => ({ variant, size: "s" })));
    expect(rows.map((row) => row.label)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("bases boolean props on their defaults", () => {
    expect(cellProps(withDefaults, { label: "Default", props: {} }, { state: "base", label: "default", props: {} }))
      .toMatchObject({ disabled: true });
  });
});

describe("state selector rewriting", () => {
  it("makes each state pseudo forceable from a cell ancestor", () => {
    expect(rewriteStateSelector(".btn:hover")).toBe(
      '.btn:is(:hover, [data-nudge-ui-sheet-state="hover"] *)',
    );
    expect(rewriteStateSelector(".a:focus, .a:focus-visible")).toBe(
      '.a:is(:focus, [data-nudge-ui-sheet-state="focus-visible"] *), '
        + '.a:is(:focus-visible, [data-nudge-ui-sheet-state="focus-visible"] *)',
    );
    expect(rewriteStateSelector("button:not(:disabled):active")).toContain(
      ':not(:is(:disabled, [data-nudge-ui-sheet-state="disabled"] *)):is(:active,',
    );
  });

  it("leaves other pseudos alone", () => {
    expect(rewriteStateSelector(".a:focus-within::after, .b:hovered")).toBe(".a:focus-within::after, .b:hovered");
  });

  it("preserves grouping wrappers and skips keyframes and font faces", () => {
    const media: RuleLike = {
      cssText: "@media (min-width: 600px) { .btn:hover { color: red; } }",
      cssRules: [{ cssText: "", selectorText: ".btn:hover", style: { cssText: "color: red;" } }],
    };
    const keyframes: RuleLike = { type: 7, cssText: "@keyframes x { }", cssRules: [] };
    const plain: RuleLike = { cssText: "", selectorText: ".btn", style: { cssText: "color: blue;" } };
    const { css, usage } = buildStateStyles([[plain, media, keyframes]]);
    expect(css).toBe(
      '.btn{color: blue;}@media (min-width: 600px){.btn:is(:hover, [data-nudge-ui-sheet-state="hover"] *){color: red;}}',
    );
    expect(usage).toEqual({ hover: true, focus: false, active: false, disabled: false });
  });
});

describe("sheet planning", () => {
  it("builds the cartesian product of select props", () => {
    const rows = planSheetRows(button);
    expect(rows.map((row) => row.label)).toEqual([
      "primary · small",
      "primary · large",
      "secondary · small",
      "secondary · large",
    ]);
  });

  it("leads with variant and size axes and holds the rest at their defaults", () => {
    const wide: ComponentContract = {
      ...button,
      props: [
        { name: "width", control: "select", options: ["full", "auto", "fit"], optional: true },
        { name: "variant", control: "select", options: ["primary", "secondary", "critical"], optional: true },
        { name: "size", control: "select", options: ["small", "medium", "large"], optional: true, defaultValue: "medium" },
        { name: "iconPosition", control: "select", options: ["leading", "trailing"], optional: true },
      ],
    };
    const rows = planSheetRows(wide);
    expect(rows).toHaveLength(27);
    expect(rows[0]).toEqual({
      label: "primary · small · full",
      props: { variant: "primary", size: "small", width: "full", iconPosition: "leading" },
    });
  });

  it("shows only states the stylesheet supports, plus prop-driven columns", () => {
    const none = planSheetColumns(button, { hover: false, focus: false, active: false, disabled: false });
    expect(none.map((column) => column.state)).toEqual(["base", "disabled", "loading"]);
    const all = planSheetColumns(button, { hover: true, focus: true, active: true, disabled: false });
    expect(all.map((column) => column.state)).toEqual([
      "base", "hover", "focus-visible", "active", "disabled", "loading",
    ]);
  });

  it("fills placeholder text and required props", () => {
    const [row] = planSheetRows(button);
    const [, , disabled] = planSheetColumns(button, { hover: true, focus: false, active: false, disabled: false });
    expect(cellProps(button, row!, disabled!)).toEqual({
      children: "Label",
      aria: "aria",
      variant: "primary",
      size: "small",
      disabled: true,
    });
  });
});

describe("statesUsedWithin", () => {
  it("counts only states whose rules style elements inside the scope", () => {
    document.body.innerHTML = `<div id="cell"><label class="box"><span class="mark"></span></label></div><a class="link"></a>`;
    const selectors = emptyStateSelectors();
    const usage = { hover: false, focus: false, active: false, disabled: false };
    for (const selector of [".box:hover .mark", ".link:focus-visible", ".link:active", ":hover > .mark", "button:not(:disabled)"]) {
      selectorStateUsage(selector, usage, selectors);
    }
    expect(usage).toEqual({ hover: true, focus: true, active: true, disabled: true });
    expect(statesUsedWithin([document.getElementById("cell")!], selectors)).toEqual({
      hover: true,
      focus: false,
      active: false,
      disabled: false,
    });
  });
});

describe("planSheetLayout", () => {
  const chip: ComponentContract = {
    componentId: "src/Chip#Chip",
    name: "Chip",
    file: "src/Chip.tsx",
    provenance: "typescript",
    props: [
      { name: "tone", control: "select", options: ["neutral", "danger"], optional: true },
      { name: "density", control: "select", options: ["compact"], optional: true },
      { name: "size", control: "select", options: ["sm", "md"], optional: true },
    ],
  };
  const none = { hover: false, focus: false, active: false, disabled: false };

  it("pivots the last varying prop into columns when no state is styled", () => {
    const { rows, columns } = planSheetLayout(chip, none);
    expect(rows.map((row) => row.label)).toEqual(["neutral", "danger"]);
    expect(columns.map((column) => [column.label, column.props])).toEqual([["sm", { size: "sm" }], ["md", { size: "md" }]]);
  });

  it("keeps states as columns when the component styles them", () => {
    const { rows, columns } = planSheetLayout(chip, { ...none, hover: true });
    expect(rows.map((row) => row.label)).toEqual(["neutral · sm", "neutral · md", "danger · sm", "danger · md"]);
    expect(columns.map((column) => column.label)).toEqual(["default", "hover"]);
  });
});

describe("neutralizeStatePseudos", () => {
  it("keeps negated states from excluding every element", () => {
    document.body.innerHTML = `<div id="cell"><button class="b"></button></div>`;
    const selectors = emptyStateSelectors();
    selectorStateUsage(".b:hover:not(.disabled, :disabled)", { hover: false, focus: false, active: false, disabled: false }, selectors);
    expect(statesUsedWithin([document.getElementById("cell")!], selectors).hover).toBe(true);
    expect(neutralizeStatePseudos(".b:focus-visible:not(:disabled)")).toBe(".b:is(*):not(:is([data-nudge-ui-never]))");
  });
});

describe("incidental style-token props", () => {
  it("are held at their default instead of becoming rows", () => {
    const colors = Array.from({ length: 30 }, (_, index) => `color-${index}`);
    const box: ComponentContract = {
      componentId: "src/Panel#Panel",
      name: "Panel",
      file: "src/Panel.tsx",
      provenance: "typescript",
      props: [
        { name: "backgroundColor", control: "select", options: colors, optional: true },
        { name: "elevation", control: "select", options: ["flat", "raised"], optional: true },
      ],
    };
    expect(planSheetRows(box).map((row) => row.label)).toEqual(["flat", "raised"]);
    expect(sheetVariantCount(box)).toBe(2);
  });
});
