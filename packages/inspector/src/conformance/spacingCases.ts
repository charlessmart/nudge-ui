import type { TokenDefinition } from "virtual:design-tokens";
import type { ConformanceFixture, ConformancePropertyExpectation } from "./fixture.ts";

function token(cssName: string, value: string, source: string): TokenDefinition {
  return {
    cssName,
    name: cssName,
    declarations: [{ value, source, important: false, context: { selector: ":root" } }],
  };
}

const SPACE_4 = token("--space-4", "16px", "fixtures/spacing.css:2");
const SPACE_ALIAS = token("--space-alias", "var(--space-4)", "fixtures/spacing.css:3");

function boxProperties(
  values: Record<string, string>,
  capability: "box-sides" | "raw" = "box-sides",
): Record<string, ConformancePropertyExpectation> {
  return Object.fromEntries(Object.entries(values).map(([property, authored]) => [property, { authored, capability }]));
}

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
  {
    id: "spacing-physical-one-value-literal",
    css: ".subject { margin: 12px; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:6:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({
        "margin-top": "12px",
        "margin-right": "12px",
        "margin-bottom": "12px",
        "margin-left": "12px",
      }),
      projection: {
        spacing: { margin: { linked: true, axes: { horizontal: { state: "shared" }, vertical: { state: "shared" } }, fields: {} } },
      },
    },
  },
  {
    id: "spacing-physical-two-value",
    css: ".subject { padding: 8px 16px; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:7:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({ "padding-top": "8px", "padding-right": "16px", "padding-bottom": "8px", "padding-left": "16px" }),
      projection: {
        spacing: { padding: { linked: false, axes: { horizontal: { state: "shared" }, vertical: { state: "shared" } }, fields: {} } },
      },
    },
  },
  {
    id: "spacing-physical-three-value",
    css: ".subject { margin: 4px 8px 12px; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:8:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({ "margin-top": "4px", "margin-right": "8px", "margin-bottom": "12px", "margin-left": "8px" }),
      projection: {
        spacing: { margin: { linked: false, axes: { horizontal: { state: "shared" }, vertical: { state: "mixed" } }, fields: {} } },
      },
    },
  },
  {
    id: "spacing-physical-longhands",
    css: ".subject { padding-top: 2px; padding-right: 5px; padding-bottom: 7px; padding-left: 9px; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:9:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({ "padding-top": "2px", "padding-right": "5px", "padding-bottom": "7px", "padding-left": "9px" }),
      projection: {
        spacing: { padding: { linked: false, axes: { horizontal: { state: "mixed" }, vertical: { state: "mixed" } }, fields: {} } },
      },
    },
  },
  {
    id: "spacing-physical-shorthand-longhand-override",
    css: ".subject { margin: 4px 8px; margin-left: 20px; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:10:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({ "margin-top": "4px", "margin-right": "8px", "margin-bottom": "4px", "margin-left": "20px" }),
      projection: {
        spacing: { margin: { linked: false, axes: { horizontal: { state: "mixed" }, vertical: { state: "shared" } }, fields: {} } },
      },
    },
  },
  {
    id: "spacing-physical-negative-margin",
    css: ".subject { margin: -8px -4px 0; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:11:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({ "margin-top": "-8px", "margin-right": "-4px", "margin-bottom": "0", "margin-left": "-4px" }),
      projection: {
        spacing: { margin: { linked: false, axes: { horizontal: { state: "shared" }, vertical: { state: "mixed" } }, fields: {} } },
      },
    },
  },
  {
    id: "spacing-physical-varied-units",
    css: ".subject { padding: 1rem 2em 3% 4vw; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:12:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({ "padding-top": "1rem", "padding-right": "2em", "padding-bottom": "3%", "padding-left": "4vw" }),
      projection: {
        spacing: { padding: { linked: false, axes: { horizontal: { state: "mixed" }, vertical: { state: "mixed" } }, fields: {} } },
      },
    },
  },
  {
    id: "spacing-logical-start-end-ltr",
    css: ".subject { direction: ltr; padding-inline-start: 10px; padding-inline-end: 14px; margin-block-start: 4px; margin-block-end: 8px; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:13:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({ "padding-left": "10px", "padding-right": "14px", "margin-top": "4px", "margin-bottom": "8px" }),
      projection: {
        spacing: {
          padding: { linked: false, axes: { horizontal: { state: "mixed" } }, fields: {} },
          margin: { linked: false, axes: { vertical: { state: "mixed" } }, fields: {} },
        },
      },
    },
  },
  {
    id: "spacing-logical-direction-ltr",
    css: ".subject { direction: ltr; padding-inline: 6px 12px; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:14:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({ "padding-left": "6px", "padding-right": "12px" }),
      projection: {
        spacing: { padding: { linked: false, axes: { horizontal: { state: "mixed" } }, fields: {} } },
      },
    },
  },
  {
    id: "spacing-logical-direction-rtl",
    css: ".subject { direction: rtl; padding-inline: 6px 12px; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:15:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({ "padding-right": "6px", "padding-left": "12px" }),
      projection: {
        spacing: { padding: { linked: false, axes: { horizontal: { state: "mixed" } }, fields: {} } },
      },
    },
  },
  {
    id: "spacing-logical-vertical-rl",
    css: ".subject { writing-mode: vertical-rl; margin-block: 6px 10px; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:16:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({ "margin-right": "6px", "margin-left": "10px" }),
      projection: {
        spacing: { margin: { linked: false, axes: { horizontal: { state: "mixed" } }, fields: {} } },
      },
    },
  },
  {
    id: "spacing-logical-inline-block-shorthands",
    css: ".subject { padding-block: 5px 9px; margin-inline: 2px; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:17:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({ "padding-top": "5px", "padding-bottom": "9px", "margin-left": "2px", "margin-right": "2px" }),
      projection: {
        spacing: {
          padding: { linked: false, axes: { vertical: { state: "mixed" } }, fields: {} },
          margin: { linked: false, axes: { horizontal: { state: "shared" } }, fields: {} },
        },
      },
    },
  },
  {
    id: "spacing-logical-physical-override",
    css: ".subject { direction: ltr; padding-inline: 12px; padding-left: 4px; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:18:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({ "padding-left": "4px", "padding-right": "12px" }),
      projection: {
        spacing: { padding: { linked: false, axes: { horizontal: { state: "mixed" } }, fields: {} } },
      },
    },
  },
  {
    id: "spacing-logical-reset-then-logical",
    css: ".subject { padding: 0; padding-inline: 16px; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:19:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({ "padding-top": "0", "padding-right": "16px", "padding-bottom": "0", "padding-left": "16px" }),
      projection: {
        spacing: { padding: { linked: false, axes: { horizontal: { state: "shared" }, vertical: { state: "shared" } }, fields: {} } },
      },
    },
  },
  {
    id: "spacing-logical-start-end-rtl",
    css: ".subject { direction: rtl; padding-inline-start: 10px; padding-inline-end: 14px; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:20:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({ "padding-right": "10px", "padding-left": "14px" }),
      projection: {
        spacing: { padding: { linked: false, axes: { horizontal: { state: "mixed" } }, fields: {} } },
      },
    },
  },
  {
    id: "spacing-token-fallback",
    css: ":root { --space-4: 16px; }\n.subject { padding: var(--space-4, 20px); }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:21:1"></div>',
    selected: ".subject",
    catalog: [SPACE_4],
    expected: {
      catalog: [{ name: "--space-4", value: "16px" }],
      properties: {
        "padding-top": { authored: "var(--space-4, 20px)", tokens: ["--space-4"], capability: "box-sides" },
        "padding-right": { authored: "var(--space-4, 20px)", tokens: ["--space-4"], capability: "box-sides" },
        "padding-bottom": { authored: "var(--space-4, 20px)", tokens: ["--space-4"], capability: "box-sides" },
        "padding-left": { authored: "var(--space-4, 20px)", tokens: ["--space-4"], capability: "box-sides" },
      },
    },
  },
  {
    id: "spacing-token-calc",
    css: ":root { --space-4: 16px; }\n.subject { padding: calc(var(--space-4) * 2); }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:22:1"></div>',
    selected: ".subject",
    catalog: [SPACE_4],
    expected: {
      catalog: [{ name: "--space-4", value: "16px" }],
      properties: {
        "padding-top": { authored: "calc(var(--space-4) * 2)", tokens: ["--space-4"], capability: "box-sides" },
        "padding-right": { authored: "calc(var(--space-4) * 2)", tokens: ["--space-4"], capability: "box-sides" },
        "padding-bottom": { authored: "calc(var(--space-4) * 2)", tokens: ["--space-4"], capability: "box-sides" },
        "padding-left": { authored: "calc(var(--space-4) * 2)", tokens: ["--space-4"], capability: "box-sides" },
      },
    },
  },
  {
    id: "spacing-auto-margin",
    css: ".subject { margin: 0 auto; }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:23:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({ "margin-top": "0", "margin-right": "auto", "margin-bottom": "0", "margin-left": "auto" }),
      projection: {
        spacing: { margin: { linked: false, axes: { horizontal: { state: "shared" }, vertical: { state: "shared" } }, fields: {} } },
      },
    },
  },
  {
    id: "spacing-unknown-value",
    css: ".subject { padding: var(--missing-space); }",
    markup: '<div class="subject" data-cid="SpacingCase" data-src="fixtures/spacing.tsx:24:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: boxProperties({
        "padding-top": "var(--missing-space)",
        "padding-right": "var(--missing-space)",
        "padding-bottom": "var(--missing-space)",
        "padding-left": "var(--missing-space)",
      }),
    },
  },
];
