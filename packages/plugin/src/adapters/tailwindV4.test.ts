import { describe, expect, it } from "vitest";
import { annotateTailwindV4Catalog, annotateTailwindV4ReconciledCatalog, createTailwindV4Adapter, detectTailwindV4, mapTailwindV4ColorOpacity, tailwindV4ColorExpression } from "./tailwindV4.ts";

describe("Tailwind v4 adapter", () => {
  it("detects CSS-first themes and generated local aliases", () => {
    expect(detectTailwindV4("@theme { --color-brand: oklch(60% .2 240); }")).toBe(true);
    expect(detectTailwindV4(".bg-brand\\/10 { --tw-bg-opacity: 0.1; }")).toBe(true);
    expect(detectTailwindV4(".button { color: red; }")).toBe(false);
  });

  it("keeps project and framework provenance distinct", () => {
    const result = annotateTailwindV4Catalog([
      { cssName: "--color-brand", name: "--color-brand", declarations: [{ value: "#123456", source: "app.css:1", important: false, context: {} }] },
      { cssName: "--color-red-500", name: "--color-red-500", declarations: [{ value: "#ef4444", source: "generated.css:2", important: false, context: {} }] },
    ], { projectTokenNames: new Set(["--color-brand"]) });
    expect(result).toMatchObject([
      { adapter: "tailwind-v4", origin: "project", editable: true },
      { adapter: "tailwind-v4", origin: "framework", editable: false },
    ]);
  });

  it("relabels the reconciled catalog deterministically from its own rows", () => {
    const result = annotateTailwindV4ReconciledCatalog([
      { cssName: "--color-brand", name: "--color-brand", adapter: "tailwind-v4", origin: "project", declarations: [] },
      { cssName: "--tw-brand-opacity", name: "--tw-brand-opacity", adapter: "tailwind-v4", origin: "generated", declarations: [] },
      { cssName: "--pkg", name: "--pkg", adapter: "tailwind-v4", origin: "package", editable: false, declarations: [] },
      { cssName: "--plain", name: "--plain", origin: "project", declarations: [] },
    ]);
    expect(result).toMatchObject([
      { adapter: "tailwind-v4", origin: "project", editable: true },
      { adapter: "tailwind-v4", origin: "framework", editable: false },
      { adapter: "tailwind-v4", origin: "package", editable: false },
      // Rows the inventory did not tag are left untouched.
      { cssName: "--plain", origin: "project" },
    ]);
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
