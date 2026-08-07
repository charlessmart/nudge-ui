import type { TokenDefinition } from "virtual:design-tokens";
import type { ConformanceFixture } from "./fixture.ts";

function token(cssName: string, value: string, source: string): TokenDefinition {
  return {
    cssName,
    name: cssName,
    declarations: [{ value, source, important: false, context: { selector: ":root" } }],
  };
}

const TYPE_SIZE = token("--type-size-body", "1rem", "fixtures/typography.css:2");
const TYPE_WEIGHT = token("--type-weight-strong", "650", "fixtures/typography.css:3");
const TYPE_LEADING = token("--type-leading-body", "1.5", "fixtures/typography.css:4");
const TYPE_TRACKING = token("--type-tracking-tight", "-0.018em", "fixtures/typography.css:5");
const TYPE_FAMILY = token("--type-family-body", 'Inter, ui-sans-serif, system-ui, sans-serif', "fixtures/typography.css:6");

/**
 * Framework-neutral typography corpus. The fixture runner asserts authored
 * CSS and capability independently from browser-computed output; the gallery
 * lets a human exercise the same cases through the real inspector.
 */
export const TYPOGRAPHY_CASES: ConformanceFixture[] = [
  {
    id: "type-direct-literals",
    css: `.subject {
  font-family: "Aster Display", Georgia, serif;
  font-size: .875rem;
  font-weight: 650;
  line-height: 1.45;
  letter-spacing: -.0125em;
}`,
    markup: '<p class="subject" data-cid="TypographyCase" data-src="fixtures/typography.tsx:1:1">Measured type makes a dense interface feel calm.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        "font-family": { authored: '"Aster Display", Georgia, serif', capability: "composite" },
        "font-size": { authored: ".875rem", capability: "atomic" },
        "font-weight": { authored: "650", capability: "atomic" },
        "line-height": { authored: "1.45", capability: "atomic" },
        "letter-spacing": { authored: "-.0125em", capability: "atomic" },
      },
    },
  },
  {
    id: "type-tokenized-longhands",
    css: `:root {
  --type-size-body: 1rem;
  --type-weight-strong: 650;
  --type-leading-body: 1.5;
  --type-tracking-tight: -0.018em;
  --type-family-body: Inter, ui-sans-serif, system-ui, sans-serif;
}
.subject {
  font-family: var(--type-family-body);
  font-size: var(--type-size-body);
  font-weight: var(--type-weight-strong);
  line-height: var(--type-leading-body);
  letter-spacing: var(--type-tracking-tight);
}`,
    markup: '<p class="subject" data-cid="TypographyCase" data-src="fixtures/typography.tsx:2:1">A token-backed paragraph keeps its rhythm across surfaces.</p>',
    selected: ".subject",
    catalog: [TYPE_SIZE, TYPE_WEIGHT, TYPE_LEADING, TYPE_TRACKING, TYPE_FAMILY],
    expected: {
      catalog: [
        { name: "--type-size-body", value: "1rem" },
        { name: "--type-weight-strong", value: "650" },
        { name: "--type-leading-body", value: "1.5" },
        { name: "--type-tracking-tight", value: "-0.018em" },
        { name: "--type-family-body", value: "Inter, ui-sans-serif, system-ui, sans-serif" },
      ],
      properties: {
        "font-family": { authored: "var(--type-family-body)", tokens: ["--type-family-body"], capability: "atomic" },
        "font-size": { authored: "var(--type-size-body)", tokens: ["--type-size-body"], capability: "atomic" },
        "font-weight": { authored: "var(--type-weight-strong)", tokens: ["--type-weight-strong"], capability: "atomic" },
        "line-height": { authored: "var(--type-leading-body)", tokens: ["--type-leading-body"], capability: "atomic" },
        "letter-spacing": { authored: "var(--type-tracking-tight)", tokens: ["--type-tracking-tight"], capability: "atomic" },
      },
    },
  },
  {
    id: "type-functional-raw",
    css: `.subject {
  font-size: clamp(1rem, 1vw + .78rem, 1.35rem);
  font-weight: var(--type-weight-strong, 600);
  line-height: calc(1em + .5rem);
  letter-spacing: max(-.03em, calc(-.012em - .08vw));
}`,
    markup: '<p class="subject" data-cid="TypographyCase" data-src="fixtures/typography.tsx:3:1">Functional values remain editable as declared CSS expressions.</p>',
    selected: ".subject",
    catalog: [TYPE_WEIGHT],
    expected: {
      catalog: [{ name: "--type-weight-strong", value: "650" }],
      properties: {
        "font-size": { authored: "clamp(1rem, 1vw + .78rem, 1.35rem)", capability: "raw" },
        "font-weight": { authored: "var(--type-weight-strong, 600)", tokens: ["--type-weight-strong"], capability: "atomic" },
        "line-height": { authored: "calc(1em + .5rem)", capability: "raw" },
        "letter-spacing": { authored: "max(-.03em, calc(-.012em - .08vw))", capability: "raw" },
      },
    },
  },
  {
    id: "type-font-shorthand",
    css: '.subject { font: italic 700 1.25rem / 1.4 "Aster Display", Georgia, serif; }',
    markup: '<p class="subject" data-cid="TypographyCase" data-src="fixtures/typography.tsx:4:1">A shorthand still yields safe longhand controls.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        "font-family": { authored: '"Aster Display", Georgia, serif', capability: "composite" },
        "font-size": { authored: "1.25rem", capability: "atomic" },
        "font-weight": { authored: "700", capability: "atomic" },
        "line-height": { authored: "1.4", capability: "atomic" },
      },
    },
  },
  {
    id: "type-font-shorthand-resets",
    css: `.subject {
  font-style: italic;
  font-weight: 700;
  line-height: 2;
  font: 16px Arial, sans-serif;
}`,
    markup: '<p class="subject" data-cid="TypographyCase" data-src="fixtures/typography.tsx:5:1">An omitted shorthand component still resets an earlier longhand.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        "font-family": { authored: "Arial, sans-serif", capability: "composite" },
        "font-size": { authored: "16px", capability: "atomic" },
        "font-style": { authored: "normal", capability: "raw" },
        "font-weight": { authored: "normal", capability: "raw" },
        "line-height": { authored: "normal", capability: "raw" },
      },
    },
  },
  {
    id: "type-keywords-and-negative-tracking",
    css: `.subject {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: larger;
  font-weight: bold;
  line-height: normal;
  letter-spacing: -1px;
}`,
    markup: '<p class="subject" data-cid="TypographyCase" data-src="fixtures/typography.tsx:6:1">Keywords should not be normalised into guessed values.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        "font-family": { authored: "ui-monospace, SFMono-Regular, Consolas, monospace", capability: "composite" },
        "font-size": { authored: "larger", capability: "raw" },
        "font-weight": { authored: "bold", capability: "raw" },
        "line-height": { authored: "normal", capability: "raw" },
        "letter-spacing": { authored: "-1px", capability: "atomic" },
      },
    },
  },
  {
    id: "type-var-fallback-family",
    css: '.subject { font-family: var(--type-family-body, Georgia, serif); font-size: 16px; }',
    markup: '<p class="subject" data-cid="TypographyCase" data-src="fixtures/typography.tsx:7:1">A family fallback retains commas inside the raw authored value.</p>',
    selected: ".subject",
    catalog: [TYPE_FAMILY],
    expected: {
      catalog: [{ name: "--type-family-body", value: "Inter, ui-sans-serif, system-ui, sans-serif" }],
      properties: {
        "font-family": { authored: "var(--type-family-body, Georgia, serif)", tokens: ["--type-family-body"], capability: "atomic" },
        "font-size": { authored: "16px", capability: "atomic" },
      },
    },
  },
];
