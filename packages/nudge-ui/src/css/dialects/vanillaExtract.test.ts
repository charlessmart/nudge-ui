import { describe, expect, it } from "vitest";
import { readThemeContract } from "./vanillaExtract.ts";

const projectContract = { source: "theme.css.ts", origin: "project", editable: true } as const;

describe("reading a theme contract", () => {
  it("walks nested contracts into human-readable token paths", () => {
    const entries = readThemeContract({
      color: { brand: "var(--color-brand__hash)" },
      space: { sm: "var(--space-sm__hash)" },
    }, projectContract);

    expect(entries).toEqual([
      expect.objectContaining({ name: "theme.color.brand", cssName: "--color-brand__hash", adapter: "vanilla-extract" }),
      expect.objectContaining({ name: "theme.space.sm", cssName: "--space-sm__hash" }),
    ]);
  });

  it("uses observed CSS values when the host supplied them", () => {
    const entries = readThemeContract({ color: { brand: "var(--color-brand__hash)" } }, {
      ...projectContract,
      cssValues: { "--color-brand__hash": "#123456" },
    });
    expect(entries[0]).toMatchObject({ value: "#123456" });
  });

  it("keeps the reference when no value was observed, rather than inventing one", () => {
    const entries = readThemeContract({ color: { brand: "var(--color-brand__hash)" } }, projectContract);
    expect(entries[0]).toMatchObject({ value: "var(--color-brand__hash)" });
  });

  it("makes no assumption about the compiler's hash format", () => {
    const entries = readThemeContract({
      color: { brand: "var(--color-brand__arbitrary_compiler_hash)", accent: "var(--ve_x7Q)" },
    }, projectContract);

    expect(entries.map((entry) => entry.cssName))
      .toEqual(["--color-brand__arbitrary_compiler_hash", "--ve_x7Q"]);
  });

  it("accepts a reference carrying a fallback", () => {
    const entries = readThemeContract({ color: { brand: "var(--brand, #000)" } }, projectContract);
    expect(entries[0]).toMatchObject({ cssName: "--brand" });
  });

  it("ignores a composed value, which is a style rather than a token identity", () => {
    expect(readThemeContract({ border: { thin: "var(--width) solid" } }, projectContract)).toEqual([]);
    expect(readThemeContract({ color: { brand: "#123456" } }, projectContract)).toEqual([]);
  });

  it("applies the requested path prefix", () => {
    const entries = readThemeContract({ color: { primary: "var(--p)" } }, {
      ...projectContract,
      prefix: "design",
    });
    expect(entries[0]).toMatchObject({ name: "design.color.primary" });
  });
});
