// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ColorOpacity, TokenEntry, TokenTable } from "../model/index.ts";
import { extractVarCalls } from "./tokenInterpretation.ts";
import {
  applyColorOpacity,
  applyColorTokenReplacement,
  colorValueHasEmbeddedAlpha,
  interpretColorOpacity,
  normalizeOpacityPercent,
  type ColorComponentResolution,
  type ColorSemanticsContext,
} from "./colorSemantics.ts";

/**
 * Fast Interface tests for the color semantics Module (plan slice 3.4).
 * These pin color format recognition, embedded-alpha detection, opacity
 * modifiers, `color-mix()` reconciliation, and meaning-preserving edits in
 * isolation: the module takes explicit token knowledge and never touches the
 * DOM or CSSOM. Expected strings are byte-identical to the pre-migration
 * characterization assertions.
 */

function entry(name: string, value: string, extra: Partial<TokenEntry> = {}): TokenEntry {
  return { name, value, source: "theme.css:1", ...extra };
}

function table(entries: TokenEntry[]): TokenTable {
  const out: TokenTable = {};
  for (const item of entries) {
    out[item.name] = item;
    if (item.cssName) out[item.cssName] = item;
  }
  return out;
}

function ctx(
  tokenTable: TokenTable,
  localAliases: ReadonlyMap<string, string> = new Map(),
  resolveTokenReference?: (value: string) => ColorComponentResolution | null,
): ColorSemanticsContext {
  return { tokenTable, localAliases, resolveTokenReference };
}

function plainCtx(tokenTable: TokenTable = table([])): ColorSemanticsContext {
  return { tokenTable };
}

/** Minimal resolver matching the Module contract: table lookup, then local aliases. */
function makeResolver(
  tokenTable: TokenTable,
  localAliases: ReadonlyMap<string, string> = new Map(),
): (value: string) => ColorComponentResolution | null {
  return (value: string): ColorComponentResolution | null => {
    const call = extractVarCalls(value)[0];
    if (!call) return null;
    const name = call.name;
    const entry = tokenTable[name];
    const raw = entry ? entry.value : localAliases.get(name);
    if (raw === undefined) return null;
    const inner = extractVarCalls(raw)[0];
    const resolved = inner && localAliases.has(inner.name) ? localAliases.get(inner.name)! : raw;
    return entry
      ? { tokenName: entry.name, resolvedValue: resolved, tokens: [{ name: entry.name, origin: "project" }] }
      : { tokenName: name, resolvedValue: resolved, tokens: [{ name, origin: "runtime" }] };
  };
}

describe("interpretColorOpacity (hex alpha read)", () => {
  it.each([
    ["#ff000088", "53.3333%"],
    ["#00000033", "20%"],
    ["#f008", "53.3333%"],
    ["#00f8", "53.3333%"],
  ] as const)("reads the alpha channel of %s", (value, expected) => {
    expect(interpretColorOpacity(value, plainCtx())).toMatchObject({ value: expected, source: "hex", tokenName: null });
    expect(interpretColorOpacity(value, plainCtx())?.authoredValue).toBe(value.slice(-(value.length === 5 ? 1 : 2)));
  });

  it("returns undefined for colors without an alpha channel", () => {
    expect(interpretColorOpacity("#f00", plainCtx())).toBeUndefined();
    expect(interpretColorOpacity("#ff0000", plainCtx())).toBeUndefined();
  });
});

describe("interpretColorOpacity (rgb/hsl alpha read)", () => {
  it.each([
    ["rgba(0, 0, 0, 0.8)", "80%", "rgb"],
    ["rgb(0 255 0 / 25%)", "25%", "rgb"],
    ["hsla(240, 100%, 50%, 0.3)", "30%", "hsl"],
    ["hsl(240 100% 50% / 40%)", "40%", "hsl"],
  ] as const)("reads the alpha of %s", (value, expected, source) => {
    expect(interpretColorOpacity(value, plainCtx())).toMatchObject({ value: expected, source, tokenName: null });
  });

  it("returns undefined for rgb() without an alpha channel", () => {
    expect(interpretColorOpacity("rgb(255 0 0)", plainCtx())).toBeUndefined();
    expect(interpretColorOpacity("hsl(0 100% 50%)", plainCtx())).toBeUndefined();
  });
});

describe("interpretColorOpacity (color-mix against transparent)", () => {
  const TOKENS = table([entry("--color-primary", "#2563eb"), entry("--opacity-muted", "0.35")]);

  it("reads a color-percentage component", () => {
    expect(interpretColorOpacity("color-mix(in oklab, var(--color-primary) 50%, transparent)", ctx(TOKENS, new Map(), makeResolver(TOKENS))))
      .toMatchObject({ value: "50%", tokenName: null, source: "color-mix" });
  });

  it("reads a token-percentage component through the resolver", () => {
    const opacity = interpretColorOpacity("color-mix(in srgb, var(--color-primary) var(--opacity-muted), transparent)", ctx(TOKENS, new Map(), makeResolver(TOKENS)));
    expect(opacity).toMatchObject({ value: "35%", tokenName: "--opacity-muted", source: "color-mix" });
    expect(opacity?.token).toMatchObject({ name: "--opacity-muted", origin: "project" });
  });

  it("mirrors the transparent percentage as 100 − p", () => {
    expect(interpretColorOpacity("color-mix(in srgb, red, transparent 80%)", plainCtx()))
      .toMatchObject({ value: "20%", source: "color-mix" });
  });

  it("defaults to 50% when neither item authors a percentage", () => {
    expect(interpretColorOpacity("color-mix(in srgb, var(--color-primary), transparent)", plainCtx()))
      .toMatchObject({ value: "50%", source: "color-mix" });
  });

  it("returns undefined when no transparent item reconciles the mix", () => {
    expect(interpretColorOpacity("color-mix(in srgb, #2563eb 10%, white)", plainCtx())).toBeUndefined();
    expect(interpretColorOpacity("color-mix(in srgb, red 10%, white)", plainCtx())).toBeUndefined();
  });

  it("normalizes two explicit color-mix weights before reporting opacity", () => {
    expect(interpretColorOpacity("color-mix(in srgb, red 80%, transparent 80%)", plainCtx()))
      .toMatchObject({ value: "50%", source: "color-mix" });
    expect(interpretColorOpacity("color-mix(in srgb, red 20%, transparent 20%)", plainCtx()))
      .toMatchObject({ value: "20%", source: "color-mix" });
  });
});

describe("interpretColorOpacity (token-backed opacity components)", () => {
  it("resolves a catalog opacity token", () => {
    const tokens = table([entry("--opacity-muted", "0.35")]);
    const opacity = interpretColorOpacity("rgb(37 99 235 / var(--opacity-muted))", ctx(tokens, new Map(), makeResolver(tokens)));
    expect(opacity).toMatchObject({ value: "35%", tokenName: "--opacity-muted", source: "rgb" });
  });

  it("resolves a local alias to its literal value and attributes the alias name", () => {
    const aliases = new Map([["--local-alpha", "0.2"]]);
    const opacity = interpretColorOpacity("rgb(0 0 0 / var(--local-alpha))", ctx(table([]), aliases, makeResolver(table([]), aliases)));
    expect(opacity).toMatchObject({ value: "20%", tokenName: "--local-alpha", source: "rgb" });
    expect(opacity?.token).toMatchObject({ name: "--local-alpha", origin: "runtime" });
  });

  it("falls back to the authored fallback for an unknown opacity reference", () => {
    const opacity = interpretColorOpacity("rgb(0 0 0 / var(--unknown-opacity, 0.4))", plainCtx());
    expect(opacity).toMatchObject({ value: "40%", tokenName: null, source: "rgb" });
  });

  it("does not discard an expression around an opacity token", () => {
    const aliases = new Map([["--opacity", "0.5"]]);
    expect(interpretColorOpacity(
      "rgb(0 0 0 / calc(var(--opacity) * 0.5))",
      ctx(table([]), aliases, makeResolver(table([]), aliases)),
    )).toBeUndefined();
  });
});

describe("colorValueHasEmbeddedAlpha", () => {
  it.each([
    ["#1234", true],
    ["#11223344", true],
    ["transparent", true],
    ["rgba(17, 34, 51, 0.5)", true],
    ["hsl(210 50% 20% / 50%)", true],
    ["hwb(210 20% 10% / 50%)", true],
    ["lab(65 10 -25 / 50%)", true],
    ["lch(65 27 290 / 50%)", true],
    ["oklab(50% 0.1 0.1 / 0.5)", true],
    ["oklch(63% 0.2 25 / 0.5)", true],
    ["color(srgb 1 0 0 / 50%)", true],
    ["color-mix(in srgb, red 50%, transparent)", true],
    ["#112233", false],
    ["rgb(17 34 51)", false],
    ["oklch(63% 0.2 25)", false],
    ["hsl(210 50% 20%)", false],
    ["color-mix(in srgb, red 50%, white)", false],
  ] as const)("detects embedded alpha in %s", (value, expected) => {
    expect(colorValueHasEmbeddedAlpha(value)).toBe(expected);
  });

  it("detects a nested color function with embedded alpha inside color-mix", () => {
    expect(colorValueHasEmbeddedAlpha("color-mix(in srgb, rgba(17, 34, 51, 0.5) 50%, red)")).toBe(true);
  });
});

describe("applyColorOpacity (meaning-preserving rewrites)", () => {
  it("rewrites hex alpha channels digit-for-digit", () => {
    expect(applyColorOpacity("#ff000088", "20%")).toEqual({ ok: true, value: "#ff000033" });
    expect(applyColorOpacity("#f008", "20%")).toEqual({ ok: true, value: "#f003" });
    expect(applyColorOpacity("#f008", "53.3333%")).toEqual({ ok: true, value: "#f008" });
    expect(applyColorOpacity("#ff000088", "25%")).toEqual({ ok: true, value: "#ff000040" });
  });

  it("replaces rgb/hsl slash and comma alpha", () => {
    expect(applyColorOpacity("rgb(255 0 0 / 80%)", "50%")).toEqual({ ok: true, value: "rgb(255 0 0 / 50%)" });
    expect(applyColorOpacity("rgba(0, 0, 0, 0.8)", "20%")).toEqual({ ok: true, value: "rgba(0, 0, 0, 20%)" });
    expect(applyColorOpacity("hsl(240 100% 50% / 40%)", "80%")).toEqual({ ok: true, value: "hsl(240 100% 50% / 80%)" });
  });

  it("reconciles color-mix percentages and mirrors the transparent item", () => {
    expect(applyColorOpacity("color-mix(in oklab, var(--color-primary) 50%, transparent)", "20%"))
      .toEqual({ ok: true, value: "color-mix(in oklab, var(--color-primary) 20%, transparent)" });
    expect(applyColorOpacity("color-mix(in srgb, var(--color-primary) var(--opacity-muted), transparent)", "50%"))
      .toEqual({ ok: true, value: "color-mix(in srgb, var(--color-primary) 50%, transparent)" });
    expect(applyColorOpacity("color-mix(in srgb, red, transparent 80%)", "50%"))
      .toEqual({ ok: true, value: "color-mix(in srgb,  red, transparent 50%)" });
    expect(applyColorOpacity("color-mix(in srgb, var(--color-primary), transparent)", "30%"))
      .toEqual({ ok: true, value: "color-mix(in srgb, var(--color-primary) 30%, transparent)" });
    expect(applyColorOpacity("color-mix(in srgb, red 80%, transparent 80%)", "25%"))
      .toEqual({ ok: true, value: "color-mix(in srgb, red 25%, transparent 75%)" });
  });

  it("wraps a bare var() in color-mix and unwraps at 100%", () => {
    expect(applyColorOpacity("var(--color-primary)", "50%"))
      .toEqual({ ok: true, value: "color-mix(in srgb, var(--color-primary) 50%, transparent)" });
    expect(applyColorOpacity("var(--color-primary)", "100%")).toEqual({ ok: true, value: "var(--color-primary)" });
  });

  it("wraps an opaque hex color without discarding its color meaning", () => {
    expect(applyColorOpacity("#ff0000", "50%"))
      .toEqual({ ok: true, value: "color-mix(in srgb, #ff0000 50%, transparent)" });
    expect(applyColorOpacity("#f00", "100%")).toEqual({ ok: true, value: "#f00" });
  });

  it.each(["rgb(17, 17, 17)", "rgb(17 17 17)", "hsl(210 20% 30%)"])(
    "wraps opaque functional color %s without discarding its color meaning",
    (value) => {
      expect(applyColorOpacity(value, "40%")).toEqual({
        ok: true,
        value: `color-mix(in srgb, ${value} 40%, transparent)`,
      });
    },
  );

  it("keeps an opaque functional color unchanged at full opacity", () => {
    expect(applyColorOpacity("rgb(17, 17, 17)", "100%"))
      .toEqual({ ok: true, value: "rgb(17, 17, 17)" });
  });

  it("returns an unsupported result for value shapes it cannot rewrite faithfully", () => {
    expect(applyColorOpacity("transparent", "50%")).toEqual({ ok: false, reason: "unsupported" });
    expect(applyColorOpacity("1px solid red", "50%")).toEqual({ ok: false, reason: "unsupported" });
    expect(applyColorOpacity("linear-gradient(red, blue)", "50%")).toEqual({ ok: false, reason: "unsupported" });
    expect(applyColorOpacity("color-mix(in srgb, red 50%, white)", "50%")).toEqual({ ok: false, reason: "unsupported" });
    expect(applyColorOpacity("url(a.png)", "50%")).toEqual({ ok: false, reason: "unsupported" });
  });

  it("returns invalid-opacity for unparseable opacity strings", () => {
    expect(applyColorOpacity("var(--color-primary)", "abc")).toEqual({ ok: false, reason: "invalid-opacity" });
    expect(applyColorOpacity("#ff0000", "")).toEqual({ ok: false, reason: "invalid-opacity" });
    expect(applyColorOpacity("#ff0000", "nope")).toEqual({ ok: false, reason: "invalid-opacity" });
    expect(applyColorOpacity("#ff0000", "var(--opacity)")).toEqual({ ok: false, reason: "invalid-opacity" });
  });
});

describe("applyColorTokenReplacement", () => {
  it("preserves the alpha modifier inside color-mix", () => {
    expect(applyColorTokenReplacement(
      "color-mix(in srgb, var(--color-red-500) 10%, transparent)",
      entry("--color-red-500", "#dc2626", { cssName: "--color-red-500" }),
      entry("--color-blue-500", "#2563eb", { cssName: "--color-blue-500" }),
    )).toEqual({ ok: true, value: "color-mix(in srgb, var(--color-blue-500) 10%, transparent)" });
  });

  it("replaces a bare var() reference by cssName", () => {
    expect(applyColorTokenReplacement(
      "var(--color-red)",
      entry("--color-red", "#dc2626", { cssName: "--color-red" }),
      entry("--color-blue", "#2563eb", { cssName: "--color-blue" }),
    )).toEqual({ ok: true, value: "var(--color-blue)" });
  });

  it("does not substitute a shorter token name inside a longer reference", () => {
    expect(applyColorTokenReplacement(
      "color-mix(in srgb, var(--color-red-500) 10%, transparent)",
      entry("--color-red", "#dc2626", { cssName: "--color-red" }),
      entry("--color-blue", "#2563eb", { cssName: "--color-blue" }),
    )).toEqual({ ok: false, reason: "unsupported" });
  });

  it("returns an unsupported result when no reference or literal matches", () => {
    expect(applyColorTokenReplacement(
      "var(--unrelated)",
      entry("--color-red", "#dc2626", { cssName: "--color-red" }),
      entry("--color-blue", "#2563eb", { cssName: "--color-blue" }),
    )).toEqual({ ok: false, reason: "unsupported" });
  });

  it("returns an unsupported result when the new token has no CSS reference name", () => {
    const literalOnly = entry("blue", "#2563eb");
    expect(applyColorTokenReplacement(
      "var(--color-red)",
      entry("--color-red", "#dc2626", { cssName: "--color-red" }),
      literalOnly,
    )).toEqual({ ok: false, reason: "unsupported" });
  });

  it("replaces literal Tailwind RGB channels while preserving its opacity expression", () => {
    expect(applyColorTokenReplacement(
      "rgb(255 0 0 / var(--tw-bg-opacity))",
      entry("theme.colors.red", "#ff0000", { adapter: "tailwind-v3", cssValue: "#ff0000" }),
      entry("theme.colors.blue", "#0000ff", { adapter: "tailwind-v3", cssValue: "#0000ff" }),
    )).toEqual({ ok: true, value: "rgb(0 0 255 / var(--tw-bg-opacity))" });
  });

  it("never replaces a token value inside another color token", () => {
    expect(applyColorTokenReplacement(
      "color-mix(in srgb, darkred 50%, transparent)",
      entry("--red", "red", { cssName: "--red" }),
      entry("--blue", "blue", { cssName: "--blue" }),
    )).toEqual({ ok: false, reason: "unsupported" });
    expect(applyColorTokenReplacement(
      "#ffffff",
      entry("--white-short", "#fff", { cssName: "--white-short" }),
      entry("--black", "#000", { cssName: "--black" }),
    )).toEqual({ ok: true, value: "var(--black)" });
  });
});

describe("normalizeOpacityPercent", () => {
  it("normalises fractions and percentages to clamped percents", () => {
    expect(normalizeOpacityPercent("0.5")).toBe("50%");
    expect(normalizeOpacityPercent("50%")).toBe("50%");
    expect(normalizeOpacityPercent("0.35")).toBe("35%");
    expect(normalizeOpacityPercent(".5")).toBe("50%");
    expect(normalizeOpacityPercent("1")).toBe("100%");
    expect(normalizeOpacityPercent("0")).toBe("0%");
    expect(normalizeOpacityPercent("0.33333")).toBe("33.333%");
    expect(normalizeOpacityPercent("-0.5")).toBe("0%");
    expect(normalizeOpacityPercent("1.5")).toBe("100%");
    expect(normalizeOpacityPercent("150%")).toBe("100%");
    expect(normalizeOpacityPercent("abc")).toBeNull();
    expect(normalizeOpacityPercent("")).toBeNull();
  });
});

describe("arbitrary input does not throw", () => {
  const oddInputs = [
    "",
    "   ",
    "var(",
    "var(--a",
    "var(---)",
    "((()))",
    "\\",
    "color-mix(",
    "color-mix(in srgb",
    "rgb(0 0 0 / var(--a",
    "linear-gradient(red, blue)",
    "url(data:image/png;base64,AAAA)",
    "::before { content: '}' }",
    "#",
    "rgb(",
    "0x",
    "--color-red",
    "var(--a) 50% transparent",
  ];

  it("interpretColorOpacity handles odd input without throwing", () => {
    for (const input of oddInputs) {
      expect(() => interpretColorOpacity(input, plainCtx()), input).not.toThrow();
    }
  });

  it("applyColorOpacity handles odd input without throwing", () => {
    for (const input of oddInputs) {
      expect(() => applyColorOpacity(input, "50%"), input).not.toThrow();
      expect(() => applyColorOpacity("var(--a)", input), input).not.toThrow();
    }
  });

  it("colorValueHasEmbeddedAlpha handles odd input without throwing", () => {
    for (const input of oddInputs) {
      expect(() => colorValueHasEmbeddedAlpha(input), input).not.toThrow();
    }
  });

  it("applyColorTokenReplacement handles odd input without throwing", () => {
    const oldToken = entry("--a", "#111", { cssName: "--a" });
    const newToken = entry("--b", "#222", { cssName: "--b" });
    for (const input of oddInputs) {
      expect(() => applyColorTokenReplacement(input, oldToken, newToken), input).not.toThrow();
    }
  });

  it("returns a full ColorOpacity shape for a recognized hex value", () => {
    const opacity: ColorOpacity | undefined = interpretColorOpacity("#ff000088", plainCtx());
    expect(opacity).toMatchObject({ value: "53.3333%", authoredValue: "88", source: "hex", tokenName: null });
  });
});
