import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { interpretDialects, type DialectEvidence } from "./index.ts";

const dialectsDir = fileURLToPath(new URL(".", import.meta.url));

function contribution(evidence: DialectEvidence, id: string) {
  return interpretDialects(evidence).contributions.find((candidate) => candidate.id === id);
}

describe("interpreting dialect evidence", () => {
  it("emits every contribution even with no evidence, so stale facts are cleared", () => {
    const { contributions } = interpretDialects();
    expect(contributions.map((candidate) => candidate.id))
      .toEqual(["dialect-tokens", "tailwind-v4-naming", "vanilla-extract-contract"]);
    expect(contributions.every((candidate) => (candidate.tokens ?? []).length === 0)).toBe(true);
  });

  it("orders contributions so later evidence refines earlier evidence", () => {
    expect(interpretDialects().contributions.map((candidate) => candidate.order)).toEqual([-1, 0, 1]);
  });

  it("turns a Tailwind v3 config into literal tokens", () => {
    expect(contribution({
      tailwindV3: { config: { theme: { colors: { brand: "#123456" } } }, source: "tailwind.config.js" },
    }, "dialect-tokens")).toMatchObject({
      tokens: [expect.objectContaining({
        name: "theme.colors.brand",
        value: "#123456",
        source: "tailwind.config.js",
        adapter: "tailwind-v3",
      })],
    });
  });

  it("ignores a config that is not Tailwind v3", () => {
    expect(contribution({ tailwindV3: { config: { plugins: [] } } }, "dialect-tokens"))
      .toMatchObject({ tokens: [] });
  });

  it("relabels Tailwind v4 tokens only when CSS evidence proves v4 is in play", () => {
    expect(contribution({ tailwindV4Css: true }, "tailwind-v4-naming")).toHaveProperty("relabellings");
    expect(contribution({ tailwindV4Css: false }, "tailwind-v4-naming")).not.toHaveProperty("relabellings");
  });

  it("treats an inline contract as editable project tokens", () => {
    expect(contribution({
      inlineThemeContract: {
        contract: { color: { brand: "var(--brand__hash)" } },
        cssValues: { "--brand__hash": "#123456" },
      },
    }, "dialect-tokens")).toMatchObject({
      tokens: [expect.objectContaining({ name: "theme.color.brand", value: "#123456", editable: true })],
    });
  });

  it("treats a published contract as identity only, leaving CSS the authority on value", () => {
    expect(contribution({
      publishedThemeContract: {
        attempted: true,
        contract: { color: { primary: "var(--primary__hash)" } },
        fromPackage: true,
        source: "@fixture/theme-contract",
      },
    }, "vanilla-extract-contract")).toMatchObject({
      definitions: [expect.objectContaining({
        name: "theme.color.primary",
        cssName: "--primary__hash",
        origin: "package",
        editable: false,
        declarations: [],
      })],
    });
  });

  it("distinguishes a contract the host never looked for from one it failed to find", () => {
    expect(contribution({}, "vanilla-extract-contract")).toEqual({ id: "vanilla-extract-contract", order: 1 });
    expect(contribution({ publishedThemeContract: { attempted: false, contract: null } }, "vanilla-extract-contract"))
      .toEqual({ id: "vanilla-extract-contract", order: 1 });
    expect(contribution({ publishedThemeContract: { attempted: true, contract: null } }, "vanilla-extract-contract"))
      .toEqual({ id: "vanilla-extract-contract", order: 1 });
  });

  it("reports a contract failure as a diagnostic instead of a silently empty catalog", () => {
    expect(contribution({
      publishedThemeContract: {
        attempted: true,
        contract: null,
        diagnostics: [{
          code: "vanilla-extract-contract-missing-export",
          module: "@fixture/theme-contract",
          exportName: "vars",
          message: "Missing vars.",
        }],
      },
    }, "vanilla-extract-contract")).toMatchObject({
      diagnostics: [{
        code: "vanilla-extract-contract-missing-export",
        artifact: "@fixture/theme-contract",
        exportName: "vars",
        message: "Missing vars.",
      }],
    });
  });

  it("carries the host's evidence-gathering failures through to the inventory", () => {
    expect(contribution({
      diagnostics: [{ code: "stylesheet-unreadable", message: "Skipped one source." }],
    }, "dialect-tokens")).toMatchObject({
      diagnostics: [{ code: "stylesheet-unreadable", message: "Skipped one source." }],
    });
  });
});

describe("reporting what the evidence proved", () => {
  it("names the evidence behind every dialect so a host can explain a thin catalog", () => {
    expect(interpretDialects().observed).toEqual([
      { dialect: "tailwind-v3", evidence: "none", tokenCount: 0 },
      { dialect: "tailwind-v4", evidence: "none", tokenCount: 0 },
      { dialect: "vanilla-extract", evidence: "none", tokenCount: 0 },
    ]);
  });

  it("distinguishes a dialect proven by CSS from one proven by configuration", () => {
    const observed = interpretDialects({
      tailwindV3: { config: { theme: { colors: { brand: "#123456" } } } },
      tailwindV4Css: true,
      publishedThemeContract: { attempted: true, contract: { c: { a: "var(--a)" } } },
    }).observed;

    expect(observed).toEqual([
      { dialect: "tailwind-v3", evidence: "config", tokenCount: 1 },
      { dialect: "tailwind-v4", evidence: "css", tokenCount: 0 },
      { dialect: "vanilla-extract", evidence: "contract", tokenCount: 1 },
    ]);
  });
});

describe("the guarantee hosts rely on", () => {
  const evidence: DialectEvidence = {
    tailwindV3: { config: { theme: { spacing: { 4: "1rem" } } } },
    tailwindV4Css: true,
    inlineThemeContract: { contract: { color: { brand: "var(--brand)" } } },
    publishedThemeContract: { attempted: true, contract: { color: { primary: "var(--primary)" } } },
  };

  it("derives token knowledge from evidence alone, so any host supplying it gets the same result", () => {
    // Hosts share no code path, so reaching this function with equal evidence is
    // what makes their token knowledge identical rather than merely similar.
    expect(interpretDialects(evidence)).toEqual(interpretDialects(structuredClone(evidence)));
  });

  it("does not mutate the evidence it was given", () => {
    const original = structuredClone(evidence);
    interpretDialects(evidence);
    expect(evidence).toEqual(original);
  });

  // The browser runtime imports this module, so a Node import would break the
  // bundle instead of failing here.
  it("stays browser-safe", () => {
    const offenders = readdirSync(dialectsDir)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .filter((name) => /from\s+["']node:/.test(readFileSync(join(dialectsDir, name), "utf8")));
    expect(offenders).toEqual([]);
  });
});
