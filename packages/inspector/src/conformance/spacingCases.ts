import type { TokenDefinition } from "virtual:design-tokens";
import type { ConformanceFixture } from "./fixture.ts";

function token(cssName: string, value: string, source: string): TokenDefinition {
  return {
    cssName,
    name: cssName,
    declarations: [{ value, source, important: false, context: { selector: ":root" } }],
  };
}

const SPACE_4 = token("--space-4", "16px", "fixtures/spacing.css:2");
const SPACE_ALIAS = token("--space-alias", "var(--space-4)", "fixtures/spacing.css:3");

/**
 * Shared spacing corpus. Unit tests run every case through the fixture runner;
 * browser tests select representative cases where real CSSOM behaviour matters.
 */
export const SPACING_CASES: ConformanceFixture[] = [
  {
    id: "spacing-physical-four-value",
    css: ".subject { padding: 8px 16px 24px 32px; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:1:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        "padding-top": { authored: "8px", capability: "box-sides" },
        "padding-right": { authored: "16px", capability: "box-sides" },
        "padding-bottom": { authored: "24px", capability: "box-sides" },
        "padding-left": { authored: "32px", capability: "box-sides" },
      },
      projection: {
        spacing: {
          padding: {
            linked: false,
            axes: { horizontal: { state: "mixed" }, vertical: { state: "mixed" } },
            fields: {},
          },
        },
      },
    },
  },
  {
    id: "spacing-logical-token",
    css: `:root { --space-4: 16px; }
.subject { padding-inline: var(--space-4); margin-block: 8px 0; }`,
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:2:1"></div>',
    selected: ".subject",
    catalog: [SPACE_4],
    expected: {
      catalog: [{ name: "--space-4", value: "16px" }],
      properties: {
        "padding-left": { authored: "var(--space-4)", tokens: ["--space-4"], capability: "box-sides" },
        "padding-right": { authored: "var(--space-4)", tokens: ["--space-4"], capability: "box-sides" },
        "margin-top": { authored: "8px", capability: "box-sides" },
        "margin-bottom": { authored: "0", capability: "box-sides" },
      },
      projection: {
        spacing: {
          padding: {
            linked: false,
            axes: { horizontal: { state: "shared" } },
            fields: {
              left: { authoredValue: "var(--space-4)", tokenName: "--space-4", sourceProperty: "padding-inline", value: "16px" },
              right: { authoredValue: "var(--space-4)", tokenName: "--space-4", sourceProperty: "padding-inline", value: "16px" },
            },
          },
        },
      },
    },
  },
  {
    id: "spacing-authored-mixed-computed-equal",
    css: `:root { --space-4: 16px; }
.subject { padding: 16px 16px 16px var(--space-4); }`,
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:3:1"></div>',
    selected: ".subject",
    catalog: [SPACE_4],
    expected: {
      catalog: [{ name: "--space-4", value: "16px" }],
      properties: {
        "padding-top": { authored: "16px", tokens: [], capability: "box-sides" },
        "padding-right": { authored: "16px", tokens: [], capability: "box-sides" },
        "padding-left": { authored: "var(--space-4)", tokens: ["--space-4"], capability: "box-sides" },
      },
      projection: {
        spacing: {
          padding: {
            linked: false,
            axes: { horizontal: { state: "mixed" }, vertical: { state: "shared" } },
            fields: {},
          },
        },
      },
    },
  },
  {
    id: "spacing-alias-token",
    css: `:root { --space-4: 16px; --space-alias: var(--space-4); }
.subject { margin: var(--space-alias); }`,
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:4:1"></div>',
    selected: ".subject",
    catalog: [SPACE_4, SPACE_ALIAS],
    expected: {
      catalog: [{ name: "--space-4", value: "16px" }, { name: "--space-alias", value: "var(--space-4)" }],
      properties: {
        "margin-top": { authored: "var(--space-alias)", tokens: ["--space-alias"], capability: "box-sides" },
        "margin-left": { authored: "var(--space-alias)", tokens: ["--space-alias"], capability: "box-sides" },
      },
      projection: {
        spacing: {
          margin: {
            linked: true,
            axes: { horizontal: { state: "shared" }, vertical: { state: "shared" } },
            fields: {},
          },
        },
      },
    },
  },
  {
    id: "spacing-functional-raw",
    css: ".subject { padding: clamp(8px, 2vw, 24px); }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:5:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        "padding-top": { authored: "clamp(8px, 2vw, 24px)", capability: "raw" },
      },
    },
  },
];
