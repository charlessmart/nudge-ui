import { createSprinkles, defineProperties } from "@vanilla-extract/sprinkles";
import { vars } from "./theme.css.ts";

const properties = defineProperties({
  properties: {
    color: vars.color,
    backgroundColor: vars.color,
    padding: vars.space,
  },
});

export const sprinkles = createSprinkles(properties);
