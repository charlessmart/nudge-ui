// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { assertConformanceFixture, runConformanceFixture } from "./fixture.ts";
import type { ConformanceFixture } from "./fixture.ts";
import type { TokenDefinition } from "virtual:design-tokens";

const CSS = `:root {
  --space-4: 1rem;
  --surface: #ffffff;
}
.fixture-card {
  padding: var(--space-4);
  color: var(--surface, hotpink);
  box-shadow: 0 2px 4px rgb(0 0 0 / .15);
}`;

const catalog: TokenDefinition[] = [
  { cssName: "--space-4", name: "--space-4", declarations: [{ value: "1rem", source: "fixtures/standard.css:2", important: false, context: { selector: ":root" } }] },
  { cssName: "--surface", name: "--surface", declarations: [{ value: "#ffffff", source: "fixtures/standard.css:3", important: false, context: { selector: ":root" } }] },
];

const fixture: ConformanceFixture = {
  id: "standard-css-smoke",
  css: CSS,
  markup: '<article class="fixture-card" data-cid="Fixture" data-src="fixtures/standard.css:1:1"></article>',
  selected: ".fixture-card",
  catalog,
  expected: {
    catalog: [{ name: "--space-4", value: "1rem" }, { name: "--surface", value: "#ffffff" }],
    properties: {
      "padding-top": { authored: "var(--space-4)", tokens: ["--space-4"], capability: "box-sides" },
      color: { authored: "var(--surface, hotpink)", tokens: ["--surface"], capability: "color" },
      "box-shadow": { authored: "0 2px 4px rgb(0 0 0 / .15)", tokens: [], capability: "composite" },
    },
  },
};

let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; document.head.innerHTML = ""; document.body.innerHTML = ""; });

describe("conformance fixture runner", () => {
  it("runs a data-led fixture through catalog, authored attribution, and capability paths", () => {
    const result = runConformanceFixture(fixture);
    cleanup = result.cleanup;
    expect(assertConformanceFixture(result, fixture)).toEqual([]);
    expect(result.properties.find((row) => row.property === "color")?.authored).toBe("var(--surface, hotpink)");
  });

  it("keeps preview setup optional and isolated from the authored expectation", () => {
    const withPreview: ConformanceFixture = {
      ...fixture,
      expected: { ...fixture.expected, preview: { property: "padding-top", value: "2rem" } },
    };
    const result = runConformanceFixture(withPreview);
    cleanup = result.cleanup;
    expect(result.preview?.requestedValue).toBe("2rem");
    expect(result.properties.find((row) => row.property === "padding-top")?.authored).toBe("var(--space-4)");
  });
});
