import type { TokenDefinition } from "virtual:design-tokens";
import type { ConformanceFixture, ConformancePropertyExpectation } from "./fixture.ts";

function token(cssName: string, value: string, source: string): TokenDefinition {
  return {
    cssName,
    name: cssName,
    declarations: [{ value, source, important: false, context: { selector: ":root" } }],
  };
}

const COLOR_BORDER = token("--color-border", "#334455", "fixtures/border.css:2");
const COLOR_ACCENT = token("--color-accent", "#ee1166", "fixtures/border.css:3");
const BORDER_SIZE = token("--border-size", "2px", "fixtures/border.css:4");
const BORDER_LINE = token("--border-line", "solid", "fixtures/border.css:5");
const SPACE_3 = token("--space-3", "12px", "fixtures/border.css:6");

type BorderParts = { width: string; style: string; color: string };

function structuredProps(
  authored: string,
  structure: BorderParts,
  properties: Record<string, { authored?: string; tokens?: string[]; structure?: BorderParts }>,
): Record<string, ConformancePropertyExpectation> {
  return Object.fromEntries(
    Object.entries(properties).map(([property, overrides]) => [
      property,
      {
        capability: "structured" as const,
        authored: overrides.authored ?? authored,
        ...(overrides.tokens ? { tokens: overrides.tokens } : {}),
        structure: overrides.structure ?? structure,
      },
    ]),
  );
}

/**
 * Framework-neutral border corpus. Covers shorthand decomposition into width,
 * style, and color longhands (including omitted CSS initials), side-specific
 * shorthands, token attribution, border-radius, and true raw fallbacks.
 */
export const BORDER_CASES: ConformanceFixture[] = [
  {
    id: "border-shorthand-literal",
    css: ".subject { border: 2px solid #334455; }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:1:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        ...structuredProps("2px solid #334455", { width: "2px", style: "solid", color: "#334455" }, {
          "border-width": {},
          "border-style": {},
          "border-color": {},
          "border-top-width": {},
          "border-right-width": {},
          "border-bottom-width": {},
          "border-left-width": {},
          "border-top-style": {},
          "border-right-style": {},
          "border-bottom-style": {},
          "border-left-style": {},
          "border-top-color": {},
          "border-right-color": {},
          "border-bottom-color": {},
          "border-left-color": {},
        }),
      },
    },
  },
  {
    id: "border-shorthand-token-color",
    css: `:root { --color-border: #334455; }
.subject { border: 1px solid var(--color-border); }`,
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:2:1"></div>',
    selected: ".subject",
    catalog: [COLOR_BORDER],
    expected: {
      catalog: [{ name: "--color-border", value: "#334455" }],
      properties: {
        ...structuredProps("1px solid var(--color-border)", { width: "1px", style: "solid", color: "var(--color-border)" }, {
          "border-width": {},
          "border-style": {},
          "border-color": { tokens: ["--color-border"] },
          "border-top-color": { tokens: ["--color-border"] },
          "border-right-color": { tokens: ["--color-border"] },
          "border-bottom-color": { tokens: ["--color-border"] },
          "border-left-color": { tokens: ["--color-border"] },
        }),
      },
    },
  },
  {
    id: "border-shorthand-keyword-width-style",
    css: ".subject { border: thin dashed red; }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:3:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        ...structuredProps("thin dashed red", { width: "thin", style: "dashed", color: "red" }, {
          "border-width": {},
          "border-style": {},
          "border-color": {},
          "border-top-width": {},
          "border-top-style": {},
          "border-top-color": {},
        }),
      },
    },
  },
  {
    id: "border-shorthand-order-permutation",
    // Hex chosen to avoid reverse-matching sandbox Tailwind/VE brand (#123456).
    css: ".subject { border: #9b4dca double 3px; }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:4:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        ...structuredProps("#9b4dca double 3px", { width: "3px", style: "double", color: "#9b4dca" }, {
          "border-width": {},
          "border-style": {},
          "border-color": {},
        }),
      },
    },
  },
  {
    id: "border-side-specific",
    css: `:root { --color-accent: #ee1166; }
.subject { border-top: 3px dotted var(--color-accent); }`,
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:5:1"></div>',
    selected: ".subject",
    catalog: [COLOR_ACCENT],
    expected: {
      catalog: [{ name: "--color-accent", value: "#ee1166" }],
      properties: {
        ...structuredProps("3px dotted var(--color-accent)", { width: "3px", style: "dotted", color: "var(--color-accent)" }, {
          "border-top-width": {},
          "border-top-style": {},
          "border-top-color": { tokens: ["--color-accent"] },
        }),
      },
    },
  },
  {
    id: "border-side-specific-right",
    css: ".subject { border-right: 4px groove #00aabb; }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:6:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        ...structuredProps("4px groove #00aabb", { width: "4px", style: "groove", color: "#00aabb" }, {
          "border-right-width": {},
          "border-right-style": {},
          "border-right-color": {},
        }),
      },
    },
  },
  {
    id: "border-shorthand-override-longhand",
    css: ".subject { border: 2px solid red; border-left-width: 8px; border-left-color: blue; }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:7:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        ...structuredProps("2px solid red", { width: "2px", style: "solid", color: "red" }, {
          "border-top-width": {},
          "border-right-width": {},
          "border-bottom-width": {},
        }),
        "border-left-width": { authored: "8px", capability: "atomic" },
        "border-left-color": { authored: "blue", capability: "color" },
      },
    },
  },
  {
    id: "border-none-style",
    css: ".subject { border: none; }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:8:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        ...structuredProps("none", { width: "medium", style: "none", color: "currentcolor" }, {
          "border-width": {},
          "border-style": {},
          "border-color": {},
        }),
      },
    },
  },
  {
    id: "border-hidden-style",
    css: ".subject { border: hidden; }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:9:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        ...structuredProps("hidden", { width: "medium", style: "hidden", color: "currentcolor" }, {
          "border-width": {},
          "border-style": {},
          "border-color": {},
        }),
      },
    },
  },
  {
    id: "border-incomplete-shorthand",
    css: ".subject { border: 2px solid; }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:10:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        ...structuredProps("2px solid", { width: "2px", style: "solid", color: "currentcolor" }, {
          "border-width": {},
          "border-style": {},
          "border-color": {},
        }),
      },
    },
  },
  {
    id: "border-unresolved-token-color",
    css: ".subject { border: 2px solid var(--missing-token); }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:11:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        ...structuredProps("2px solid var(--missing-token)", { width: "2px", style: "solid", color: "var(--missing-token)" }, {
          "border-width": {},
          "border-style": {},
          "border-color": {},
        }),
      },
    },
  },
  {
    id: "border-radius-atomic",
    css: ".subject { border-radius: 8px; }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:12:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        "border-top-left-radius": { authored: "8px", capability: "atomic" },
        "border-top-right-radius": { authored: "8px", capability: "atomic" },
        "border-bottom-right-radius": { authored: "8px", capability: "atomic" },
        "border-bottom-left-radius": { authored: "8px", capability: "atomic" },
      },
    },
  },
  {
    id: "border-radius-token",
    css: `:root { --space-3: 12px; }
.subject { border-radius: var(--space-3); }`,
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:13:1"></div>',
    selected: ".subject",
    catalog: [SPACE_3],
    expected: {
      catalog: [{ name: "--space-3", value: "12px" }],
      properties: {
        "border-top-left-radius": { authored: "var(--space-3)", tokens: ["--space-3"], capability: "atomic" },
        "border-top-right-radius": { authored: "var(--space-3)", tokens: ["--space-3"], capability: "atomic" },
        "border-bottom-right-radius": { authored: "var(--space-3)", tokens: ["--space-3"], capability: "atomic" },
        "border-bottom-left-radius": { authored: "var(--space-3)", tokens: ["--space-3"], capability: "atomic" },
      },
    },
  },
  {
    id: "border-radius-shorthand",
    css: ".subject { border-radius: 4px 8px 12px 16px; }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:14:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        "border-top-left-radius": { authored: "4px", capability: "atomic" },
        "border-top-right-radius": { authored: "8px", capability: "atomic" },
        "border-bottom-right-radius": { authored: "12px", capability: "atomic" },
        "border-bottom-left-radius": { authored: "16px", capability: "atomic" },
      },
    },
  },
  {
    id: "border-width-longhand-four-value",
    css: ".subject { border-width: 2px 4px 6px 8px; }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:15:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        "border-width": { authored: "2px 4px 6px 8px", capability: "raw" },
      },
    },
  },
  {
    id: "border-style-longhand-multi",
    css: ".subject { border-style: solid dashed; }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:16:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        "border-style": { authored: "solid dashed", capability: "raw" },
      },
    },
  },
  {
    id: "border-color-longhand-token",
    css: `:root { --color-border: #334455; }
.subject { border-color: var(--color-border); }`,
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:17:1"></div>',
    selected: ".subject",
    catalog: [COLOR_BORDER],
    expected: {
      catalog: [{ name: "--color-border", value: "#334455" }],
      properties: {
        "border-color": { authored: "var(--color-border)", tokens: ["--color-border"], capability: "structured" },
      },
    },
  },
  {
    id: "border-longhands-separate",
    css: `:root {
  --border-size: 2px;
  --border-line: solid;
  --color-border: #334455;
}
.subject {
  border-width: var(--border-size);
  border-style: var(--border-line);
  border-color: var(--color-border);
}`,
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:18:1"></div>',
    selected: ".subject",
    catalog: [BORDER_SIZE, BORDER_LINE, COLOR_BORDER],
    expected: {
      catalog: [
        { name: "--border-size", value: "2px" },
        { name: "--border-line", value: "solid" },
        { name: "--color-border", value: "#334455" },
      ],
      properties: {
        "border-width": { authored: "var(--border-size)", tokens: ["--border-size"], capability: "atomic" },
        "border-style": { authored: "var(--border-line)", tokens: ["--border-line"], capability: "atomic" },
        "border-color": { authored: "var(--color-border)", tokens: ["--color-border"], capability: "structured" },
      },
    },
  },
  {
    id: "border-collapse-reset",
    css: ".subject { border: 2px solid #334455; border-style: none; }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:19:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        ...structuredProps("2px solid #334455", { width: "2px", style: "solid", color: "#334455" }, {
          "border-top-style": {},
        }),
        "border-style": { authored: "none", capability: "raw" },
      },
    },
  },
  {
    id: "border-width-single",
    css: ".subject { border-width: 2px; }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:20:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        "border-width": { authored: "2px", capability: "atomic" },
      },
    },
  },
  {
    id: "border-top-width-longhand",
    css: ".subject { border-top-width: 5px; }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:21:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        "border-top-width": { authored: "5px", capability: "atomic" },
      },
    },
  },
  {
    id: "border-all-sides-different",
    css: ".subject { border-top: 1px solid red; border-right: 2px dotted green; border-bottom: 3px dashed blue; border-left: 4px double black; }",
    markup: '<div class="subject" data-cid="BorderCase" data-src="fixtures/border.tsx:22:1"></div>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        ...structuredProps("1px solid red", { width: "1px", style: "solid", color: "red" }, {
          "border-top-width": {},
          "border-top-style": {},
          "border-top-color": {},
        }),
        ...structuredProps("2px dotted green", { width: "2px", style: "dotted", color: "green" }, {
          "border-right-width": {},
          "border-right-style": {},
          "border-right-color": {},
        }),
        ...structuredProps("3px dashed blue", { width: "3px", style: "dashed", color: "blue" }, {
          "border-bottom-width": {},
          "border-bottom-style": {},
          "border-bottom-color": {},
        }),
        ...structuredProps("4px double black", { width: "4px", style: "double", color: "black" }, {
          "border-left-width": {},
          "border-left-style": {},
          "border-left-color": {},
        }),
      },
    },
  },
];
