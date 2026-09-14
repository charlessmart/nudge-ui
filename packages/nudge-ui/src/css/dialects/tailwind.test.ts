import { describe, expect, it } from "vitest";
import {
  detectTailwindV4,
  isTailwindV3Config,
  readTailwindV3Config,
  readTailwindV4AlphaUtility,
  tailwindV4AlphaExpression,
  tailwindV4Relabelling,
} from "./tailwind.ts";

const config = {
  theme: {
    colors: { brand: "#123456", blue: { 500: "#3b82f6" } },
    spacing: { 3: "0.75rem", 4: "1rem" },
    borderRadius: { md: "0.375rem" },
    extend: { colors: { accent: "#abcdef" } },
  },
};

describe("Tailwind v3 config", () => {
  it("reads nested theme paths as human-readable token names", () => {
    expect(isTailwindV3Config(config)).toBe(true);
    expect(readTailwindV3Config(config)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "theme.colors.brand", adapter: "tailwind-v3", origin: "project" }),
      expect.objectContaining({ name: "theme.colors.blue.500" }),
    ]));
  });

  it("merges theme.extend over the base theme", () => {
    expect(readTailwindV3Config(config)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "theme.colors.accent", value: "#abcdef" }),
    ]));
  });

  it("records configured values literally rather than inventing a custom property", () => {
    const spacing = readTailwindV3Config(config).find((entry) => entry.name === "theme.spacing.3");
    expect(spacing).toMatchObject({ value: "0.75rem", cssValue: "0.75rem", adapter: "tailwind-v3" });
    expect(spacing).not.toHaveProperty("cssName");
    expect(readTailwindV3Config(config)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "theme.borderRadius.md", value: "0.375rem" }),
    ]));
  });

  it("takes the primary value from a font-size tuple", () => {
    const tokens = readTailwindV3Config({ theme: { fontSize: { sm: ["0.875rem", { lineHeight: "1.25rem" }] } } });
    expect(tokens).toEqual([expect.objectContaining({ name: "theme.fontSize.sm", value: "0.875rem" })]);
  });

  it("rejects a v4 config", () => {
    expect(isTailwindV3Config({ theme: { colors: {} }, __tailwindVersion: 4 })).toBe(false);
    expect(isTailwindV3Config({ colors: {} })).toBe(false);
  });
});

describe("Tailwind v4 CSS", () => {
  it("detects CSS-first themes and generated local aliases", () => {
    expect(detectTailwindV4("@theme { --color-brand: oklch(60% .2 240); }")).toBe(true);
    expect(detectTailwindV4('@import "tailwindcss";')).toBe(true);
    expect(detectTailwindV4(".bg-brand\\/10 { --tw-bg-opacity: 0.1; }")).toBe(true);
    expect(detectTailwindV4(".button { color: red; }")).toBe(false);
  });

  it("relabels authored theme entries as editable and generated ones as framework-owned", () => {
    expect(tailwindV4Relabelling().relabellings).toEqual([
      { adapter: "tailwind-v4", fromOrigin: "project", origin: "project", editable: true },
      { adapter: "tailwind-v4", fromOrigin: "generated", origin: "framework", editable: false },
    ]);
  });

  it("reads single-colour alpha utilities and nothing else", () => {
    expect(readTailwindV4AlphaUtility("bg-red-500/10")).toMatchObject({ baseName: "--color-red-500", alpha: "10%" });
    expect(readTailwindV4AlphaUtility("bg-brand/25%")).toMatchObject({ baseName: "--color-brand", alpha: "25%" });
    expect(readTailwindV4AlphaUtility("bg-[linear-gradient(red,blue)]/10")).toBeNull();
    expect(readTailwindV4AlphaUtility("bg-brand")).toBeNull();
    expect(readTailwindV4AlphaUtility("bg-brand/101")).toBeNull();
  });

  it("builds the expression Tailwind itself emits", () => {
    expect(tailwindV4AlphaExpression("--color-red-500", "10%"))
      .toBe("color-mix(in oklab, var(--color-red-500) 10%, transparent)");
  });
});
