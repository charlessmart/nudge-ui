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
    lg: null,
    xl: null,
  },
  type: {
    sm: null,
    md: null,
    lg: null,
  },
  layout: {
    narrow: null,
    wide: null,
    full: null,
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
    lg: "24px",
    xl: "32px",
  },
  type: {
    sm: "0.875rem",
    md: "1rem",
    lg: "1.5rem",
  },
  layout: {
    narrow: "240px",
    wide: "100%",
    full: "100vw",
  },
});
