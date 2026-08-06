import { describe, expect, it } from "vitest";
import { createTailwindV4Adapter, detectTailwindV4, mapTailwindV4ColorOpacity, tailwindV4ColorExpression } from "./tailwindV4.ts";

describe("Tailwind v4 adapter", () => {
  it("detects CSS-first themes and generated local aliases", () => {
    expect(detectTailwindV4("@theme { --color-brand: oklch(60% .2 240); }")).toBe(true);
    expect(detectTailwindV4(".bg-brand\\/10 { --tw-bg-opacity: 0.1; }")).toBe(true);
    expect(detectTailwindV4(".button { color: red; }")).toBe(false);
  });

  it("maps only single-color opacity utilities", () => {
    expect(mapTailwindV4ColorOpacity("bg-red-500/10")).toMatchObject({ baseName: "--color-red-500", alpha: "10%" });
    expect(mapTailwindV4ColorOpacity("bg-brand/25%")).toMatchObject({ baseName: "--color-brand", alpha: "25%" });
    expect(mapTailwindV4ColorOpacity("bg-[linear-gradient(red,blue)]/10")).toBeNull();
    expect(tailwindV4ColorExpression("--color-red-500", "10%")).toContain("var(--color-red-500)");
  });

  it("is an enrichment-only adapter because v4 token variables come from emitted CSS", () => {
    const adapter = createTailwindV4Adapter('@import "tailwindcss"; @theme { --spacing: 4px; }');
    expect(adapter.detect()).toBe(true);
    expect(adapter.extractTokens()).toEqual([]);
  });
});
