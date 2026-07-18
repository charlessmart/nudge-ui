/**
 * Describes the small amount of CSS value semantics the inspector can safely
 * assist with. Values outside these policies remain raw CSS.
 */
export type CssUnit = "px" | "rem" | "em" | "%" | "";

export type ValuePolicy =
  | {
      kind: "raw" | "number";
      defaultUnit: null;
      allowedUnits: readonly [];
    }
  | {
      kind: "unit";
      defaultUnit: CssUnit;
      allowedUnits: readonly CssUnit[];
    }
  | {
      kind: "line-height";
      defaultUnit: "%";
      allowedUnits: readonly ["%", "px", ""];
    };

const RAW_VALUE: ValuePolicy = { kind: "raw", defaultUnit: null, allowedUnits: [] };
const NUMBER_VALUE: ValuePolicy = { kind: "number", defaultUnit: null, allowedUnits: [] };

const PIXEL_LENGTH: ValuePolicy = {
  kind: "unit",
  defaultUnit: "px",
  allowedUnits: ["px", "rem", "em", "%"],
};

const BORDER_WIDTH: ValuePolicy = {
  kind: "unit",
  defaultUnit: "px",
  allowedUnits: ["px", "rem", "em"],
};

const FONT_SIZE: ValuePolicy = {
  kind: "unit",
  defaultUnit: "rem",
  allowedUnits: ["rem", "px", "em", "%"],
};

const LINE_HEIGHT: ValuePolicy = {
  kind: "line-height",
  defaultUnit: "%",
  allowedUnits: ["%", "px", ""],
};

const LETTER_SPACING: ValuePolicy = {
  kind: "unit",
  defaultUnit: "em",
  allowedUnits: ["em"],
};

const FLEX_BASIS: ValuePolicy = {
  kind: "unit",
  defaultUnit: "px",
  allowedUnits: ["px", "%"],
};

const NUMBER_PROPERTIES = new Set(["flex-grow", "flex-shrink", "order", "font-weight"]);
const PIXEL_LENGTH_PROPERTIES = new Set([
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "row-gap",
  "column-gap",
  "gap",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "inset-block",
  "inset-inline",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "border-radius",
]);

/** Returns the default and supported units for an editable CSS property. */
export function valuePolicyFor(property: string): ValuePolicy {
  if (NUMBER_PROPERTIES.has(property)) return NUMBER_VALUE;
  if (property === "font-size") return FONT_SIZE;
  if (property === "line-height") return LINE_HEIGHT;
  if (property === "letter-spacing") return LETTER_SPACING;
  if (property === "flex-basis") return FLEX_BASIS;
  if (/^border(?:-(?:top|right|bottom|left))?-width$/.test(property)) return BORDER_WIDTH;
  if (/^(?:margin|padding)-(?:horizontal|vertical)$/.test(property)) return PIXEL_LENGTH;
  if (PIXEL_LENGTH_PROPERTIES.has(property)) return PIXEL_LENGTH;
  return RAW_VALUE;
}
