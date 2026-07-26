import { describe, it, expect } from "vitest";
import { generatePrompt } from "./generatePrompt.ts";
import { detectFramework } from "./detectFramework.ts";
import type { ChangeRecord, ElementChangeRecord } from "../changesLog.ts";
import type { TokenEntry } from "virtual:design-tokens";
import type { DomMutationRecord } from "../domMutations.ts";

const SURFACE_RAISED: TokenEntry = { name: "--color-surface-raised", value: "#ffffff", source: "styles.css:1" };
const SURFACE_SUNKEN: TokenEntry = { name: "--color-surface-sunken", value: "#f5f5f5", source: "styles.css:2" };
const SPACE_3: TokenEntry = { name: "--space-3", value: "12px", source: "styles.css:3" };

function rec(
  overrides: Partial<ElementChangeRecord> & { cid: string; file: string; property: string; line?: number },
): ElementChangeRecord {
  return {
    line: 42,
    selector: `[data-cid="${overrides.cid}"][data-src*="${overrides.file}:${overrides.line ?? 42}"]`,
    oldToken: null,
    newToken: null,
    source: { file: overrides.file, line: overrides.line ?? 42, component: overrides.cid },
    ...overrides,
  };
}

describe("generatePrompt", () => {
  it("includes temporary DOM operations as source-level structural instructions", () => {
    const move: DomMutationRecord = {
      id: "dom-1", action: "move", cid: "NavItem", file: "src/Nav.tsx", line: 12,
      selector: '[data-cid="NavItem"]', source: { file: "src/Nav.tsx", line: 12, component: "NavItem" },
      from: { parentTag: "nav", index: 2 }, to: { parentTag: "nav", index: 0 }, outerHTML: "<a />", scope: "source-site", stale: false,
    };
    const out = generatePrompt([], undefined, [move]);
    expect(out).toContain("## DOM structure changes");
    expect(out).toContain("Move `NavItem` (src/Nav.tsx:12) from `nav` position 3 to `nav` position 1.");
  });

  it("returns the empty sentinel when there are no changes", () => {
    const out = generatePrompt([]);
    expect(out).toBe(
      "<!-- No changes to export -->\n\nThe changes log is empty. Make a change in the Design Tool inspector first.",
    );
  });

  it("renders a token swap matching PLAN.md structure", () => {
    const r = rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "background",
      oldToken: SURFACE_RAISED,
      newToken: SURFACE_SUNKEN,
    });
    const out = generatePrompt([r]);
    expect(out).toContain("# Design changes for Button.tsx");
    expect(out).toContain("Framework: React + CSS custom properties");
    expect(out).toContain("## Changes");
    expect(out).toContain("### Button (src/Button.tsx:42)");
    expect(out).toContain("- `background`: `--color-surface-raised` → `--color-surface-sunken`");
    expect(out).toContain("## Selectors (fallback)");
    expect(out).toContain('- `[data-cid="Button"][data-src*="src/Button.tsx:42"]');
  });

  it("renders a raw value edit with the not-a-token marker", () => {
    const r = rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "padding",
      rawValue: "16px",
      oldRawValue: "4px",
    });
    const out = generatePrompt([r]);
    expect(out).toContain("- `padding`: `4px` → `16px` (not a token — consider adding one)");
  });

  it("preserves logical source intent when the preview edit is physical", () => {
    const out = generatePrompt([rec({
      cid: "Card",
      file: "src/Card.tsx",
      property: "padding-left",
      oldRawValue: "16px",
      rawValue: "24px",
      sourceProperty: "padding-inline",
      sourceAuthoredValue: "var(--space-4)",
    })]);
    expect(out).toContain("Preserve existing tokens, logical properties, and CSS intent");
    expect(out).toContain("Source declaration (CSSOM): `padding-inline: var(--space-4)`; preview edit uses physical `padding-left`");
  });

  it("renders a raw value edit with only the new value when no old value is recorded", () => {
    const r = rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "padding",
      rawValue: "16px",
    });
    const out = generatePrompt([r]);
    expect(out).toContain("- `padding`: `16px` (not a token — consider adding one)");
    expect(out).not.toContain("→");
  });

  it("renders a promotion of a hardcoded value to a token", () => {
    const r = rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "border-radius",
      newToken: SPACE_3,
      oldRawValue: "8px",
    });
    const out = generatePrompt([r]);
    expect(out).toContain(
      "- `border-radius`: `8px` → `var(--space-3)` (promoted from raw value — consider adding a dedicated token)",
    );
  });

  it("groups multiple changes for the same element + file under one heading", () => {
    const a = rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "background",
      oldToken: SURFACE_RAISED,
      newToken: SURFACE_SUNKEN,
    });
    const b = rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "border-radius",
      rawValue: "12px",
    });
    const out = generatePrompt([a, b]);
    const headings = out.split("\n").filter((l) => l.startsWith("### Button"));
    expect(headings).toHaveLength(1);
    expect(out).toContain("- `background`: `--color-surface-raised` → `--color-surface-sunken`");
    expect(out).toContain("- `border-radius`: `12px` (not a token — consider adding one)");
    const selectorLines = out.split("\n").filter((l) => l.startsWith("- `[data-cid=\"Button\"]"));
    expect(selectorLines).toHaveLength(1);
  });

  it("renders multiple headings for changes across multiple elements", () => {
    const a = rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "background",
      oldToken: SURFACE_RAISED,
      newToken: SURFACE_SUNKEN,
    });
    const b = rec({
      cid: "NavLink",
      file: "src/components/Header.tsx",
      line: 58,
      property: "color",
      oldToken: null,
      newToken: SURFACE_RAISED,
    });
    const out = generatePrompt([a, b]);
    expect(out).toContain("### Button (src/Button.tsx:42)");
    expect(out).toContain("### NavLink (src/components/Header.tsx:58)");
    expect(out).toContain('- `[data-cid="Button"][data-src*="src/Button.tsx:42"]');
    expect(out).toContain('- `[data-cid="NavLink"][data-src*="src/components/Header.tsx:58"]');
  });

  it("uses the first group file basename in the top header", () => {
    const a = rec({
      cid: "Button",
      file: "src/components/Header.tsx",
      property: "background",
      oldToken: SURFACE_RAISED,
      newToken: SURFACE_SUNKEN,
    });
    const out = generatePrompt([a]);
    expect(out).toContain("# Design changes for Header.tsx");
  });

  it("deduplicates by diffing first vs last, ignoring intermediate changes", () => {
    const a = rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "padding",
      rawValue: "8px",
      oldRawValue: "4px",
    });
    const b = rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "padding",
      rawValue: "12px",
      oldRawValue: "8px",
    });
    const c = rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "padding",
      rawValue: "16px",
      oldRawValue: "12px",
    });
    const out = generatePrompt([a, b, c]);
    expect(out).toContain("- `padding`: `4px` → `16px` (not a token — consider adding one)");
    expect(out).not.toContain("8px → 12px");
  });

  it("deduplicates token swaps by diffing original token vs final token", () => {
    const a = rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "background",
      oldToken: SURFACE_RAISED,
      newToken: SURFACE_SUNKEN,
    });
    const b = rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "background",
      oldToken: SURFACE_SUNKEN,
      newToken: SPACE_3,
    });
    const out = generatePrompt([a, b]);
    expect(out).toContain(
      "- `background`: `--color-surface-raised` → `--space-3`",
    );
    expect(out).not.toContain("--color-surface-sunken → --space-3");
  });

  it("deduplication is scoped per element — different cid properties are not collapsed", () => {
    const a = rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "padding",
      rawValue: "8px",
    });
    const b = rec({
      cid: "NavLink",
      file: "src/components/Header.tsx",
      property: "padding",
      rawValue: "16px",
    });
    const out = generatePrompt([a, b]);
    expect(out).toContain("### Button (src/Button.tsx:42)");
    expect(out).toContain("### NavLink (src/components/Header.tsx:42)");
    expect(out).toContain("`8px`");
    expect(out).toContain("`16px`");
  });

  it("accepts framework hints and surfaces them in the header", () => {
    const r = rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "background",
      oldToken: SURFACE_RAISED,
      newToken: SURFACE_SUNKEN,
    });
    const out = generatePrompt([r], { framework: "React", stylingSystem: "vanilla-extract (sprinkles)" });
    expect(out).toContain("Framework: React + vanilla-extract (sprinkles)");
  });

  it("uses a human-readable adapter token in the prompt while selectors keep implementation identity", () => {
    const out = generatePrompt([rec({
      cid: "SprinklesCard",
      file: "src/Card.tsx",
      property: "color",
      oldToken: { name: "theme.color.brand", cssName: "--color-brand__hash", value: "#123456", source: "theme.ts", adapter: "vanilla-extract" },
      newToken: { name: "theme.color.accent", cssName: "--color-accent__hash", value: "#abcdef", source: "theme.ts", adapter: "vanilla-extract" },
    })], { framework: "React", stylingSystem: "vanilla-extract (sprinkles)" });
    expect(out).toContain("theme.color.brand");
    expect(out).toContain("theme.color.accent");
    expect(out).not.toContain("--color-accent__hash");
  });

  it("renders global token edits separately with source, context and fallback", () => {
    const out = generatePrompt([{
      kind: "token",
      tokenName: "--color-text",
      file: "src/theme.css",
      line: 6,
      selector: ':root[data-theme="dark"]',
      property: "--color-text",
      rawValue: "var(--color-neutral-100)",
      oldRawValue: "#eeeeee",
      context: {},
      contextLabel: 'root[data-theme="dark"]',
      source: { file: "src/theme.css", line: 6, component: "Global token" },
    }]);
    expect(out).toContain("## Global token changes");
    expect(out).toContain('`--color-text` (root[data-theme="dark"], src/theme.css:6)');
    expect(out).toContain('`#eeeeee` → `var(--color-neutral-100)`');
    expect(out).toContain('`--color-text` in `:root[data-theme="dark"]`');
    expect(out).not.toContain("### Global token");
  });
});

describe("detectFramework", () => {
  it("defaults to React + CSS custom properties when no adapter is present", () => {
    expect(detectFramework([])).toEqual({ framework: "React", stylingSystem: "CSS custom properties" });
    expect(detectFramework([{ name: "--x", value: "1", source: "a.css" }])).toEqual({
      framework: "React",
      stylingSystem: "CSS custom properties",
    });
  });

  it("detects vanilla-extract (sprinkles) when any token carries that adapter", () => {
    const tokens: TokenEntry[] = [
      { name: "--x", value: "1", source: "a.css", adapter: "vanilla-extract" },
      { name: "--y", value: "2", source: "b.css" },
    ];
    expect(detectFramework(tokens)).toEqual({ framework: "React", stylingSystem: "vanilla-extract (sprinkles)" });
  });

  it("detects tailwind v3 / v4", () => {
    expect(detectFramework([{ name: "--x", value: "1", source: "a", adapter: "tailwind-v3" }]).stylingSystem).toBe(
      "Tailwind v3",
    );
    expect(detectFramework([{ name: "--x", value: "1", source: "a", adapter: "tailwind-v4" }]).stylingSystem).toBe(
      "Tailwind v4",
    );
  });
});
