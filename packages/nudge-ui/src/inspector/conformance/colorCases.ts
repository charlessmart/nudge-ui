import type { TokenDefinition } from "../../css/model/index.ts";
import type { ConformanceFixture } from "./fixture.ts";

function token(cssName: string, value: string, source: string): TokenDefinition {
  return {
    cssName,
    name: cssName,
    declarations: [{ value, source, important: false, context: { selector: ":root" } }],
  };
}

const COLOR_TEXT_PRIMARY = token("--color-text-primary", "#1a1a2e", "fixtures/color.css:1");
const COLOR_TEXT_SECONDARY = token("--color-text-secondary", "#52526b", "fixtures/color.css:2");
const COLOR_SURFACE_RAISED = token("--color-surface-raised", "#ffffff", "fixtures/color.css:3");
const COLOR_SURFACE_SUNKEN = token("--color-surface-sunken", "#f5f5f0", "fixtures/color.css:4");
const COLOR_SURFACE = token("--color-surface", "#fafafa", "fixtures/color.css:5");
const COLOR_ACCENT = token("--color-accent", "oklch(63% .2 25)", "fixtures/color.css:6");
const COLOR_PRIMARY = token("--color-primary", "#2563eb", "fixtures/color.css:7");
const COLOR_DANGER = token("--color-danger", "#dc2626", "fixtures/color.css:8");
const OPACITY_MUTED = token("--opacity-muted", "0.35", "fixtures/color.css:9");

/**
 * Framework-neutral color corpus covering `color` and `background-color`.
 * Each fixture asserts authored CSS values and capability against the
 * inspector's resolution pipeline. The gallery lets a human exercise the
 * same cases through the real inspector UI.
 */
export const COLOR_CASES: ConformanceFixture[] = [
  {
    id: "color-named-keywords",
    css: `.subject {
  color: red;
  background-color: linen;
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:1:1">A named-keyword element with a warm background.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        color: { authored: "red", capability: "color" },
        "background-color": { authored: "linen", capability: "color" },
      },
    },
  },
  {
    id: "color-hex-short",
    css: `.subject {
  color: #f00;
  background-color: #0f0;
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:2:1">Short hex colors remain a meaningful declared value.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        color: { authored: "#f00", capability: "color" },
        "background-color": { authored: "#0f0", capability: "color" },
      },
    },
  },
  {
    id: "color-hex-six-digit",
    css: `.subject {
  color: #1a1a2e;
  background-color: #ffffff;
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:3:1">Six-digit hex colors span the full gamut.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        color: { authored: "#1a1a2e", capability: "color" },
        "background-color": { authored: "#ffffff", capability: "color" },
      },
    },
  },
  {
    id: "color-hex-alpha-eight",
    css: `.subject {
  color: #ff000088;
  background-color: #00000033;
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:4:1">Eight-digit hex with alpha channel preserves the full authored value.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        color: { authored: "#ff000088", opacity: "53.3333%", capability: "color" },
        "background-color": { authored: "#00000033", opacity: "20%", capability: "color" },
      },
    },
  },
  {
    id: "color-hex-four-digit",
    css: `.subject {
  color: #f008;
  background-color: #00f8;
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:5:1">Four-digit hex with alpha shorthand.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        color: { authored: "#f008", opacity: "53.3333%", capability: "color" },
        "background-color": { authored: "#00f8", opacity: "53.3333%", capability: "color" },
      },
    },
  },
  {
    id: "color-rgb-legacy",
    css: `.subject {
  color: rgb(255, 0, 0);
  background-color: rgba(0, 0, 0, 0.8);
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:6:1">Legacy comma-separated rgb and rgba syntax.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        color: { authored: "rgb(255, 0, 0)", capability: "color" },
        "background-color": { authored: "rgba(0, 0, 0, 0.8)", opacity: "80%", capability: "color" },
      },
    },
  },
  {
    id: "color-rgb-modern",
    css: `.subject {
  color: rgb(255 0 0);
  background-color: rgb(0 255 0 / 25%);
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:7:1">Modern space-separated rgb with optional alpha.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        color: { authored: "rgb(255 0 0)", capability: "color" },
        "background-color": { authored: "rgb(0 255 0 / 25%)", opacity: "25%", capability: "color" },
      },
    },
  },
  {
    id: "color-rgb-percent",
    css: `.subject {
  color: rgb(100% 0% 0%);
  background-color: rgb(94% 97% 100%);
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:8:1">Percentage-based rgb channels.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        color: { authored: "rgb(100% 0% 0%)", capability: "color" },
        "background-color": { authored: "rgb(94% 97% 100%)", capability: "color" },
      },
    },
  },
  {
    id: "color-hsl-legacy",
    css: `.subject {
  color: hsl(0, 100%, 50%);
  background-color: hsla(240, 100%, 50%, 0.3);
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:9:1">Legacy comma-separated hsl and hsla syntax.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        color: { authored: "hsl(0, 100%, 50%)", capability: "color" },
        "background-color": { authored: "hsla(240, 100%, 50%, 0.3)", opacity: "30%", capability: "color" },
      },
    },
  },
  {
    id: "color-hsl-modern",
    css: `.subject {
  color: hsl(0 100% 50% / 80%);
  background-color: hsl(240 100% 50% / 40%);
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:10:1">Modern space-separated hsl with alpha.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        color: { authored: "hsl(0 100% 50% / 80%)", opacity: "80%", capability: "color" },
        "background-color": { authored: "hsl(240 100% 50% / 40%)", opacity: "40%", capability: "color" },
      },
    },
  },
  {
    id: "color-oklch",
    css: `.subject {
  color: oklch(63% .2 25);
  background-color: oklch(95% .01 100);
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:11:1">oklch color space with chromatic coverage.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        color: { authored: "oklch(63% .2 25)", capability: "color" },
        "background-color": { authored: "oklch(95% .01 100)", capability: "color" },
      },
    },
  },
  {
    id: "color-oklab",
    css: `.subject {
  color: oklab(50% .1 .05);
  background-color: lab(50% 50 50);
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:12:1">oklab and lab color spaces.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        color: { authored: "oklab(50% .1 .05)", capability: "color" },
        "background-color": { authored: "lab(50% 50 50)", capability: "color" },
      },
    },
  },
  {
    id: "color-transparent-currentcolor",
    css: `.subject {
  color: transparent;
  background-color: currentColor;
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:13:1">Special keywords are kept as-authored.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        color: { authored: "transparent", capability: "color" },
        "background-color": { authored: "currentColor", capability: "color" },
      },
    },
  },
  {
    id: "color-system-keywords",
    css: `.subject {
  color: HighlightText;
  background-color: ButtonFace;
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:14:1">Deprecated system color keywords.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        color: { authored: "HighlightText", capability: "color" },
        "background-color": { authored: "ButtonFace", capability: "color" },
      },
    },
  },
  {
    id: "color-token-simple",
    css: `:root {
  --color-text-primary: #1a1a2e;
  --color-surface-raised: #ffffff;
}
.subject {
  color: var(--color-text-primary);
  background-color: var(--color-surface-raised);
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:15:1">Token-backed colors across foreground and background.</p>',
    selected: ".subject",
    catalog: [COLOR_TEXT_PRIMARY, COLOR_SURFACE_RAISED],
    expected: {
      catalog: [
        { name: "--color-text-primary", value: "#1a1a2e" },
        { name: "--color-surface-raised", value: "#ffffff" },
      ],
      properties: {
        color: { authored: "var(--color-text-primary)", tokens: ["--color-text-primary"], capability: "color" },
        "background-color": { authored: "var(--color-surface-raised)", tokens: ["--color-surface-raised"], capability: "color" },
      },
    },
  },
  {
    id: "color-token-fallback",
    css: `:root {
  --color-text-secondary: #52526b;
  --color-surface-sunken: #f5f5f0;
}
.subject {
  color: var(--color-text-secondary, #333);
  background-color: var(--color-surface-sunken, #eee);
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:16:1">Tokens with fallback values keep the authored fallback intact.</p>',
    selected: ".subject",
    catalog: [COLOR_TEXT_SECONDARY, COLOR_SURFACE_SUNKEN],
    expected: {
      catalog: [
        { name: "--color-text-secondary", value: "#52526b" },
        { name: "--color-surface-sunken", value: "#f5f5f0" },
      ],
      properties: {
        color: { authored: "var(--color-text-secondary, #333)", tokens: ["--color-text-secondary"], capability: "color" },
        "background-color": { authored: "var(--color-surface-sunken, #eee)", tokens: ["--color-surface-sunken"], capability: "color" },
      },
    },
  },
  {
    id: "color-token-bg-only",
    css: `:root {
  --color-surface: #fafafa;
}
.subject {
  background-color: var(--color-surface);
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:17:1">Background-color only, no foreground token.</p>',
    selected: ".subject",
    catalog: [COLOR_SURFACE],
    expected: {
      catalog: [{ name: "--color-surface", value: "#fafafa" }],
      properties: {
        "background-color": { authored: "var(--color-surface)", tokens: ["--color-surface"], capability: "color" },
      },
    },
  },
  {
    id: "color-token-unknown-fallback",
    css: `.subject {
  color: var(--unknown-color, hotpink);
  background-color: var(--unknown-bg, transparent);
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:18:1">Unknown tokens should surface the raw expression.</p>',
    selected: ".subject",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        color: { authored: "var(--unknown-color, hotpink)", tokens: [], capability: "color" },
        "background-color": { authored: "var(--unknown-bg, transparent)", tokens: [], capability: "color" },
      },
    },
  },
  {
    id: "color-mix-token",
    css: `:root {
  --color-primary: #2563eb;
}
.subject {
  color: color-mix(in oklab, var(--color-primary) 50%, transparent);
  background-color: color-mix(in srgb, var(--color-primary) 10%, white);
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:19:1">color-mix() preserves the authored expression with token references.</p>',
    selected: ".subject",
    catalog: [COLOR_PRIMARY],
    expected: {
      catalog: [{ name: "--color-primary", value: "#2563eb" }],
      properties: {
        color: { authored: "color-mix(in oklab, var(--color-primary) 50%, transparent)", tokens: ["--color-primary"], opacity: "50%", capability: "color" },
        "background-color": { authored: "color-mix(in srgb, var(--color-primary) 10%, white)", tokens: ["--color-primary"], capability: "color" },
      },
    },
  },
  {
    id: "color-opacity-token",
    css: `:root {
  --color-primary: #2563eb;
  --opacity-muted: 0.35;
}
.subject {
  color: color-mix(in srgb, var(--color-primary) var(--opacity-muted), transparent);
  background-color: rgb(37 99 235 / var(--opacity-muted));
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:23:1">Opacity can be supplied by a token and displayed as its resolved value.</p>',
    selected: ".subject",
    catalog: [COLOR_PRIMARY, OPACITY_MUTED],
    expected: {
      catalog: [
        { name: "--color-primary", value: "#2563eb" },
        { name: "--opacity-muted", value: "0.35" },
      ],
      properties: {
        color: {
          authored: "color-mix(in srgb, var(--color-primary) var(--opacity-muted), transparent)",
          tokens: ["--color-primary", "--opacity-muted"],
          opacity: "35%",
          opacityToken: "--opacity-muted",
          capability: "color",
        },
        "background-color": {
          authored: "rgb(37 99 235 / var(--opacity-muted))",
          tokens: ["--opacity-muted"],
          opacity: "35%",
          opacityToken: "--opacity-muted",
          capability: "color",
        },
      },
    },
  },
  {
    id: "color-fill-and-stroke",
    css: `:root {
  --color-accent: oklch(63% .2 25);
  --color-surface: #fafafa;
}
.subject {
  background-color: var(--color-surface);
  fill: var(--color-accent);
  stroke: var(--color-accent);
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:20:1">fill and stroke are treated as color-capable properties.</p>',
    selected: ".subject",
    catalog: [COLOR_ACCENT, COLOR_SURFACE],
    expected: {
      catalog: [
        { name: "--color-accent", value: "oklch(63% .2 25)" },
        { name: "--color-surface", value: "#fafafa" },
      ],
      properties: {
        "background-color": { authored: "var(--color-surface)", tokens: ["--color-surface"], capability: "color" },
        fill: { authored: "var(--color-accent)", tokens: ["--color-accent"], capability: "color" },
        stroke: { authored: "var(--color-accent)", tokens: ["--color-accent"], capability: "color" },
      },
    },
  },
  {
    id: "color-hex-comparison",
    css: `.subject {
  color: #dc2626;
  background-color: #fef2f2;
}
.subject-two {
  color: #dc2626;
  background-color: #fef2f2;
}`,
    markup: '<div class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:21:1">A companion element with both foreground and background.</div><div class="subject-two" data-cid="ColorCase" data-src="fixtures/color.tsx:21:2">A companion element with both foreground and background.</div>',
    selected: ".subject-two",
    catalog: [],
    expected: {
      catalog: [],
      properties: {
        color: { authored: "#dc2626", capability: "color" },
        "background-color": { authored: "#fef2f2", capability: "color" },
      },
    },
  },
  {
    id: "color-token-alias-chain",
    css: `:root {
  --color-danger: #dc2626;
  --color-error: var(--color-danger);
}
.subject {
  color: var(--color-error);
}`,
    markup: '<p class="subject" data-cid="ColorCase" data-src="fixtures/color.tsx:22:1">An aliased token that points to another defined token.</p>',
    selected: ".subject",
    catalog: [COLOR_DANGER, token("--color-error", "var(--color-danger)", "fixtures/color.css:3b")],
    expected: {
      catalog: [
        { name: "--color-danger", value: "#dc2626" },
        { name: "--color-error", value: "var(--color-danger)" },
      ],
      properties: {
        color: { authored: "var(--color-error)", tokens: ["--color-error"], capability: "color" },
      },
    },
  },
];
