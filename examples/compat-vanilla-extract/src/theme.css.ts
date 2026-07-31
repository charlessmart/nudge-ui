import { createTheme, createThemeContract } from "@vanilla-extract/css";

export const vars = createThemeContract({
  color: {
    brand: null,
    accent: null,
    emphasis: null,
    surface: null,
  },
  space: {
    sm: null,
    md: null,
  },
});

export const themeClass = createTheme(vars, {
  color: {
    brand: "#123456",
    accent: "#abcdef",
    emphasis: vars.color.brand,
    surface: "#f4f7fa",
  },
  space: {
    sm: "8px",
    md: "16px",
  },
});
