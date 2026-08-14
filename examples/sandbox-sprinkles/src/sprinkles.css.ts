import { createSprinkles, defineProperties } from "@vanilla-extract/sprinkles";
import { vars } from "./theme.css.ts";

const properties = defineProperties({
  properties: {
    color: vars.color,
    backgroundColor: vars.color,
    borderColor: vars.color,
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
