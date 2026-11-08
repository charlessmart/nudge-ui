// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { ElementChangeRecord, TokenChangeRecord } from "../changes/types.ts";
import type { TokenEntry } from "../../css/model/index.ts";
import { generateComponentPrompt } from "./componentPrompt.ts";
import { EMPTY_SENTINEL } from "./generatePrompt.ts";

const PRIMARY = { componentName: "Button", props: { variant: "primary" } };

function edit(overrides: Partial<ElementChangeRecord> & { property: string }): ElementChangeRecord {
  return {
    cid: "Button",
    file: "src/components/Button.tsx",
    line: 18,
    column: 5,
    selector: '[data-cid="Button"]',
    oldToken: null,
    newToken: null,
    source: { file: "src/components/Button.tsx", line: 18, component: "Button" },
    sourceEvidence: { tagName: "button", text: "Label", props: "variant:primary", domPath: "div > button" },
    sourceInstanceCount: 12,
    ...overrides,
  };
}

describe("generateComponentPrompt", () => {
  it("says a single change in one sentence", () => {
    const out = generateComponentPrompt([
      edit({ property: "background-color", oldRawValue: "var(--color-accent)", rawValue: "#2563eb", variantScope: PRIMARY }),
    ]);

    expect(out).toBe([
      "Please update the Button component in src/components/Button.tsx: for the primary variant, make the background #2563eb (currently var(--color-accent)). Change the component itself so every place it's used picks this up.",
      "Leave the other variants as they are.",
    ].join("\n\n"));
  });

  it("names the component once and lists a variant's changes under one heading", () => {
    const out = generateComponentPrompt([
      edit({ property: "background-color", oldRawValue: "var(--color-accent)", rawValue: "#2563eb", variantScope: PRIMARY }),
      edit({ property: "border-radius", oldRawValue: "6px", rawValue: "999px", variantScope: PRIMARY }),
      edit({ property: "background-color", state: "hover", oldRawValue: "var(--color-accent-hover)", rawValue: "#1d4ed8", variantScope: PRIMARY }),
    ], undefined, [], "Keep using the project's tokens.");

    expect(out).toBe([
      "Please update the Button component in src/components/Button.tsx. Change the component itself so every place it's used picks this up.",
      [
        "For the primary variant:",
        "- Make the background #2563eb (currently var(--color-accent)).",
        "- Make the corner radius 999px (currently 6px).",
        "- On hover, make the background #1d4ed8 (currently var(--color-accent-hover)).",
      ].join("\n"),
      "Leave the other variants as they are.",
      "Keep using the project's tokens.",
    ].join("\n\n"));
  });

  it("leaves out page-finding details such as placeholder text, props and DOM paths", () => {
    const out = generateComponentPrompt([
      edit({ property: "color", rawValue: "white" }),
      edit({ property: "font-weight", oldRawValue: "500", rawValue: "600" }),
    ]);

    expect(out).not.toMatch(/Label|domPath|div > button|variant:primary|on the page|:18/);
    expect(out).toContain("- Make the text colour white.");
    expect(out).toContain("- Make the font weight 600 (currently 500).");
    expect(out).not.toContain("Leave the other variants");
  });

  it("separates edits for every variant from edits for one variant", () => {
    const out = generateComponentPrompt([
      edit({ property: "padding-inline", oldRawValue: "12px", rawValue: "16px" }),
      edit({ property: "background-color", rawValue: "#2563eb", variantScope: { componentName: "Button", props: { variant: "primary", size: "sm" } } }),
    ]);

    expect(out).toContain("For every variant:\n- Make the horizontal padding 16px (currently 12px).");
    expect(out).toContain("For the primary variant with size sm:\n- Make the background #2563eb.");
  });

  it("names inner elements by tag and line when more than one is edited", () => {
    const out = generateComponentPrompt([
      edit({ property: "gap", rawValue: "8px" }),
      edit({ property: "font-size", rawValue: "14px", line: 24, column: 7, source: { file: "src/components/Button.tsx", line: 24, component: "Button" }, sourceEvidence: { tagName: "span", props: null } }),
    ]);

    expect(out).toContain("The <button> on line 18:\n- Make the gap 8px.");
    expect(out).toContain("The <span> on line 24:\n- Make the font size 14px.");
  });

  it("asks for token swaps by token name", () => {
    const accent: TokenEntry = { name: "--color-accent", value: "#3b82f6", source: "tokens.css:4" };
    const strong: TokenEntry = { name: "--color-accent-strong", value: "#1d4ed8", source: "tokens.css:5" };
    const out = generateComponentPrompt([edit({ property: "background-color", oldToken: accent, newToken: strong })]);

    expect(out).toContain("make the background use the --color-accent-strong token instead of --color-accent.");
  });

  it("groups several components under their own names", () => {
    const out = generateComponentPrompt([
      edit({ property: "color", rawValue: "white" }),
      edit({ cid: "Card", property: "border-radius", rawValue: "12px", file: "src/components/Card.tsx", line: 9, source: { file: "src/components/Card.tsx", line: 9, component: "Card" } }),
    ]);

    expect(out).toContain("Please update these components.");
    expect(out).toContain("Button (src/components/Button.tsx):\n\n- Make the text colour white.");
    expect(out).toContain("Card (src/components/Card.tsx):\n\n- Make the corner radius 12px.");
  });

  it("keeps the page wording for edits that are not component style edits", () => {
    const token: TokenChangeRecord = {
      kind: "token",
      tokenName: "--color-accent",
      file: "src/tokens.css",
      line: 4,
      selector: ":root",
      property: "--color-accent",
      rawValue: "#2563eb",
      oldRawValue: "#3b82f6",
      important: false,
      context: { kind: "root" } as TokenChangeRecord["context"],
      contextLabel: ":root",
      source: { file: "src/tokens.css", line: 4, component: "" },
    };
    const out = generateComponentPrompt([edit({ property: "color", rawValue: "white" }), token]);

    expect(out).toContain("Also:\n\nSite-wide design tokens:\n- Change --color-accent from #3b82f6 to #2563eb");
  });

  it("returns the empty message when nothing changed", () => {
    expect(generateComponentPrompt([])).toBe(EMPTY_SENTINEL);
  });
});
