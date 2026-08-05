// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TokenEntry, TokenTable } from "../model/index.ts";
import {
  defaultTokenOrigin,
  extractVarCalls,
  interpretTokenValue,
  type TokenInterpretationContext,
} from "./tokenInterpretation.ts";

/**
 * Fast Interface tests for the value-semantics token-interpretation Module
 * (plan slice 3.2). These pin the interpretation behavior in isolation: the
 * module takes token knowledge plus injected policies and never touches the
 * DOM or CSSOM.
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

function ctx(partial: Partial<TokenInterpretationContext> & { table: TokenTable }): TokenInterpretationContext {
  return partial;
}

describe("extractVarCalls (balanced var() scanning)", () => {
  it("collects simple references with their names", () => {
    expect(extractVarCalls("var(--a) var(--b)")).toEqual([{ name: "--a" }, { name: "--b" }]);
    expect(extractVarCalls("var(--space-4)")).toEqual([{ name: "--space-4" }]);
    expect(extractVarCalls("no references here")).toEqual([]);
    expect(extractVarCalls("")).toEqual([]);
  });

  it("takes the first top-level comma as the fallback separator", () => {
    expect(extractVarCalls("var(--a, red)")).toEqual([{ name: "--a", fallback: "red" }]);
    expect(extractVarCalls("var(--a, rgb(1 2 3 / 50%))"))
      .toEqual([{ name: "--a", fallback: "rgb(1 2 3 / 50%)" }]);
  });

  it("handles nested parens and nested var() calls", () => {
    expect(extractVarCalls("var(--a, calc(var(--b) + 4px))"))
      .toEqual([{ name: "--a", fallback: "calc(var(--b) + 4px)" }]);
    expect(extractVarCalls("calc(var(--a) + var(--b))"))
      .toEqual([{ name: "--a" }, { name: "--b" }]);
  });

  it("tolerates quoted commas inside a fallback", () => {
    const calls = extractVarCalls('var(--font, "Arial, sans-serif")');
    expect(calls).toEqual([{ name: "--font", fallback: '"Arial, sans-serif"' }]);
  });
});

describe("interpretTokenValue (token references and leaves)", () => {
  const BASIC = table([entry("--space-4", "16px")]);

  it("resolves a single reference with its primary and leaf token", () => {
    const res = interpretTokenValue("var(--space-4)", ctx({ table: BASIC }));
    expect(res.tokenName).toBe("--space-4");
    expect(res.resolvedValue).toBe("16px");
    expect(res.leafTokenName).toBe("--space-4");
    expect(res.tokens).toEqual([{ name: "--space-4", origin: "project" }]);
    expect(res.opacity).toBeUndefined();
    expect(res.modifiers).toEqual([]);
    expect(res.cycle).toBeUndefined();
  });

  it("traverses chained catalog aliases depth-first to the leaf", () => {
    const res = interpretTokenValue("var(--a)", ctx({
      table: table([
        entry("--a", "var(--b)"),
        entry("--b", "var(--c)"),
        entry("--c", "8px"),
      ]),
    }));
    expect(res.tokenName).toBe("--a");
    expect(res.resolvedValue).toBe("8px");
    expect(res.leafTokenName).toBe("--c");
  });

  it("deduplicates repeated references", () => {
    const res = interpretTokenValue("calc(var(--space-4) + var(--space-4))", ctx({ table: BASIC }));
    expect(res.tokens).toEqual([{ name: "--space-4", origin: "project" }]);
    expect(res.tokenName).toBe("--space-4");
  });

  it("picks the first known reference when several vars are present", () => {
    const res = interpretTokenValue("var(--space-1) var(--space-2)", ctx({
      table: table([entry("--space-1", "4px"), entry("--space-2", "8px")]),
    }));
    expect(res.tokenName).toBe("--space-1");
    expect(res.resolvedValue).toBe("4px");
    expect(res.tokens).toEqual([{ name: "--space-1", origin: "project" }, { name: "--space-2", origin: "project" }]);
  });

  it("keeps a token with embedded alpha as one opaque value", () => {
    const res = interpretTokenValue("var(--color-muted)", ctx({
      table: table([entry("--color-muted", "rgba(37, 99, 235, 0.5)")]),
    }));
    expect(res.tokenName).toBe("--color-muted");
    expect(res.resolvedValue).toBe("rgba(37, 99, 235, 0.5)");
    expect(res.opacity).toBeUndefined();
  });
});

describe("interpretTokenValue (fallbacks and modifiers)", () => {
  const TABLE = table([
    entry("--color-text-secondary", "#52526b"),
    entry("--color-primary", "#2563eb"),
  ]);

  it("retains the fallback as a modifier when the primary reference is known", () => {
    const res = interpretTokenValue("var(--color-text-secondary, #333)", ctx({ table: TABLE }));
    expect(res.tokenName).toBe("--color-text-secondary");
    expect(res.resolvedValue).toBe("#52526b");
    expect(res.modifiers).toEqual([{ kind: "fallback", value: "#333" }]);
  });

  it("keeps an unknown reference with a fallback raw but reports the fallback modifier", () => {
    const res = interpretTokenValue("var(--unknown-color, hotpink)", ctx({ table: TABLE }));
    expect(res.tokenName).toBeNull();
    expect(res.resolvedValue).toBe("var(--unknown-color, hotpink)");
    expect(res.tokens).toEqual([]);
    expect(res.modifiers).toEqual([{ kind: "fallback", value: "hotpink" }]);
  });

  it("collects token-backed fallback references alongside the primary reference", () => {
    const res = interpretTokenValue("var(--color-error, var(--color-primary))", ctx({
      table: table([entry("--color-error", "#dc2626"), entry("--color-primary", "#2563eb")]),
    }));
    expect(res.tokenName).toBe("--color-error");
    expect(res.resolvedValue).toBe("#dc2626");
    expect(res.tokens).toEqual([
      { name: "--color-error", origin: "project" },
      { name: "--color-primary", origin: "project" },
    ]);
  });

  it("resolves a nested fallback expression without flattening it", () => {
    const res = interpretTokenValue("var(--space-4, calc(var(--space-2) * 2))", ctx({
      table: table([entry("--space-4", "16px"), entry("--space-2", "8px")]),
    }));
    expect(res.tokenName).toBe("--space-4");
    expect(res.resolvedValue).toBe("16px");
    expect(res.tokens).toEqual([{ name: "--space-4", origin: "project" }, { name: "--space-2", origin: "project" }]);
    expect(res.modifiers).toEqual([{ kind: "fallback", value: "calc(var(--space-2) * 2)" }]);
  });
});

describe("interpretTokenValue (unknown refs and raw preservation)", () => {
  it("keeps an unknown reference without fallback unresolved", () => {
    const res = interpretTokenValue("var(--nope)", ctx({ table: table([]) }));
    expect(res.tokenName).toBeNull();
    expect(res.resolvedValue).toBe("var(--nope)");
    expect(res.tokens).toEqual([]);
  });

  it("keeps a hardcoded value as its own resolved value", () => {
    const res = interpretTokenValue("16px", ctx({ table: table([]) }));
    expect(res.tokenName).toBeNull();
    expect(res.resolvedValue).toBe("16px");
  });

  it("does not promote an unknown token inside a compound value", () => {
    const res = interpretTokenValue("1px solid var(--color-unknown)", ctx({ table: table([]) }));
    expect(res.tokenName).toBeNull();
    expect(res.resolvedValue).toBe("1px solid var(--color-unknown)");
  });

  it("treats css-wide keywords as literal, non-token values", () => {
    for (const keyword of ["inherit", "initial", "unset", "revert", "revert-layer"]) {
      const res = interpretTokenValue(keyword, ctx({ table: table([]) }));
      expect(res.tokenName, keyword).toBeNull();
      expect(res.resolvedValue, keyword).toBe(keyword);
      expect(res.tokens, keyword).toEqual([]);
    }
  });
});

describe("interpretTokenValue (alias cycles)", () => {
  it("terminates direct alias cycles with a diagnostic", () => {
    const res = interpretTokenValue("var(--a)", ctx({
      table: table([entry("--a", "var(--b)"), entry("--b", "var(--a)")]),
    }));
    expect(res.cycle).toBe("--a");
    expect(res.tokenName).toBe("--a");
    expect(res.resolvedValue).toBe("var(--b)");
  });

  it("terminates self-references without looping", () => {
    const res = interpretTokenValue("var(--a)", ctx({ table: table([entry("--a", "var(--a)")]) }));
    expect(res.cycle).toBe("--a");
    expect(typeof res.resolvedValue).toBe("string");
  });
});

describe("interpretTokenValue (local aliases are explicit facts)", () => {
  const TABLE = table([entry("--color-danger", "#dc2626")]);

  it("attributes a local alias to the alias name with a runtime origin", () => {
    const res = interpretTokenValue("var(--color-error)", ctx({
      table: TABLE,
      localAliases: new Map([["--color-error", "var(--color-danger)"]]),
    }));
    expect(res.tokenName).toBe("--color-error");
    expect(res.resolvedValue).toBe("#dc2626");
    expect(res.leafTokenName).toBe("--color-danger");
    expect(res.tokens).toEqual([{ name: "--color-error", origin: "runtime" }]);
  });

  it("allows the integration to re-attribute implementation aliases", () => {
    const res = interpretTokenValue("var(--tw-leading)", ctx({
      table: table([entry("--leading-tight", "1.25")]),
      localAliases: new Map([["--tw-leading", "var(--leading-tight)"]]),
      resolveAlias: (ref, inner) => ref.startsWith("--tw-") && inner.tokenName
        ? { known: true, tokenName: inner.tokenName, resolvedValue: inner.resolvedValue, leafTokenName: inner.leafTokenName ?? null }
        : { known: true, tokenName: ref, resolvedValue: inner.resolvedValue, leafTokenName: inner.leafTokenName ?? ref },
    }));
    expect(res.tokenName).toBe("--leading-tight");
    expect(res.resolvedValue).toBe("1.25");
    expect(res.tokens).toEqual([{ name: "--leading-tight", origin: "project" }]);
  });

  it("keeps an unresolved local alias raw", () => {
    const res = interpretTokenValue("var(--missing-alias)", ctx({
      table: table([]),
      localAliases: new Map([["--other", "1px"]]),
    }));
    expect(res.tokenName).toBeNull();
    expect(res.resolvedValue).toBe("var(--missing-alias)");
  });
});

describe("interpretTokenValue (direct literal attribution)", () => {
  it("attributes a direct literal token before var() interpretation", () => {
    const direct = entry("theme.colors.brand", "#123456", { cssName: "--tw-v3-brand", adapter: "tailwind-v3" });
    const res = interpretTokenValue("rgb(18 52 86 / 0.1)", ctx({
      table: table([direct]),
      resolveDirectToken: (value) => (value.startsWith("rgb(18 52 86") ? direct : undefined),
    }));
    expect(res.tokenName).toBe("theme.colors.brand");
    expect(res.tokens).toEqual([{ name: "theme.colors.brand", origin: "project" }]);
    expect(res.resolvedValue).toBe("#123456");
  });
});

describe("interpretTokenValue (primary vs alpha token)", () => {
  const TABLE = table([entry("--opacity-muted", "0.35")]);

  it("keeps an alpha-only token reference out of the primary token", () => {
    const res = interpretTokenValue("rgb(37 99 235 / var(--opacity-muted))", ctx({
      table: TABLE,
    }));
    expect(res.tokenName).toBeNull();
    expect(res.resolvedValue).toBe("rgb(37 99 235 / var(--opacity-muted))");
    expect(res.tokens).toEqual([{ name: "--opacity-muted", origin: "project" }]);
    expect(res.opacity).toMatchObject({ value: "35%", tokenName: "--opacity-muted" });
    expect(res.modifiers).toEqual([{ kind: "alpha", value: "35%" }]);
  });

  it("keeps the color token primary when an opacity token is also referenced", () => {
    const res = interpretTokenValue("color-mix(in srgb, var(--color-primary) var(--opacity-muted), transparent)", ctx({
      table: table([entry("--color-primary", "#2563eb"), entry("--opacity-muted", "0.35")]),
    }));
    expect(res.tokenName).toBe("--color-primary");
    expect(res.resolvedValue).toBe("#2563eb");
    expect(res.tokens).toEqual([
      { name: "--color-primary", origin: "project" },
      { name: "--opacity-muted", origin: "project" },
    ]);
    expect(res.opacity).toMatchObject({ value: "35%", tokenName: "--opacity-muted", source: "color-mix" });
    expect(res.modifiers).toEqual([{ kind: "alpha", value: "35%" }]);
  });
});

describe("interpretTokenValue (origin derivation)", () => {
  it("uses the neutral origin default and honors an injected policy", () => {
    expect(defaultTokenOrigin(undefined)).toBe("runtime");
    expect(defaultTokenOrigin(entry("--x", "1px"))).toBe("project");
    expect(defaultTokenOrigin(entry("--x", "1px", { origin: "framework" }))).toBe("framework");

    const res = interpretTokenValue("var(--space-4)", ctx({
      table: table([entry("--space-4", "16px", { origin: "framework" })]),
    }));
    expect(res.tokens).toEqual([{ name: "--space-4", origin: "framework" }]);

    const injected = interpretTokenValue("var(--space-4)", ctx({
      table: table([entry("--space-4", "16px")]),
      resolveOrigin: (entry) => (entry?.adapter === "tailwind-v4" ? "framework" : entry?.origin ?? "project"),
    }));
    expect(injected.tokens).toEqual([{ name: "--space-4", origin: "project" }]);
  });
});

describe("interpretTokenValue (arbitrary input does not throw)", () => {
  it.each([
    "",
    "   ",
    "var(",
    "var(--a",
    "var(---)",
    "var(--a, var(--b",
    "((()))",
    "\\",
    '"quoted string"',
    "'single'",
    "var(--a, \"x, y\")",
    "rgb(0 0 0 / 50%)",
    "color-mix(in srgb, var(--a) 50%, transparent)",
    "url(data:image/png;base64,AAAA) var(--a)",
    "::before { content: '}' }",
  ])("does not throw for odd input %j", (input) => {
    expect(() => interpretTokenValue(input, ctx({
      table: table([entry("--a", "1px"), entry("--b", "2px")]),
    }))).not.toThrow();
  });
});
