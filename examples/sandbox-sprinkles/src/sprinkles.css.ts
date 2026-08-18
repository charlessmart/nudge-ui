import { createSprinkles, defineProperties } from "@vanilla-extract/sprinkles";
import { colorWithAlpha } from "./colorOpacity.ts";
import { vars } from "./theme.css.ts";

// Unlike Tailwind's arbitrary `/10` modifier, Sprinkles makes the allowed
// values explicit. Keep alpha variants named and token-backed so the same
// values can be used for background, text, and border colors.
const colorProperties = {
  ...vars.color,
  brandWash10: colorWithAlpha(vars.color.brand, 10),
  brandWash20: colorWithAlpha(vars.color.brand, 20),
  brandWash30: colorWithAlpha(vars.color.brand, 30),
  brandWash40: colorWithAlpha(vars.color.brand, 40),
  brandWash60: colorWithAlpha(vars.color.brand, 60),
  brandWash80: colorWithAlpha(vars.color.brand, 80),
  accentWash40: colorWithAlpha(vars.color.accent, 40),
  surfaceWash75: colorWithAlpha(vars.color.surface, 75),
};

const properties = defineProperties({
  properties: {
    color: colorProperties,
    backgroundColor: colorProperties,
    borderColor: colorProperties,
    padding: vars.space,
    paddingInline: vars.space,
    paddingBlock: vars.space,
    margin: vars.space,
    marginTop: vars.space,
    gap: vars.space,
    fontSize: vars.type,
    fontWeight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeight: { tight: 1.2, normal: 1.5, relaxed: 1.75 },
    textAlign: { left: "left", center: "center", right: "right" },
    width: vars.layout,
    height: vars.layout,
    display: { block: "block", flex: "flex", grid: "grid", none: "none" },
    gridTemplateColumns: { two: "repeat(2, minmax(0, 1fr))", three: "repeat(3, minmax(0, 1fr))" },
    borderWidth: { thin: "1px", thick: "4px" },
    borderStyle: { solid: "solid", dashed: "dashed" },
    borderRadius: { sm: "6px", lg: "18px", full: "9999px" },
  },
});

export const sprinkles = createSprinkles(properties);
