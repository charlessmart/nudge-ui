import { describe, it, expect } from "vitest";
import { generatePrompt } from "./generatePrompt.ts";
import { detectFramework } from "./detectFramework.ts";
import type { ElementChangeRecord, TextContentChangeRecord } from "../changesLog.ts";
import type { TokenEntry } from "virtual:design-tokens";
import { makeComponentChange } from "../changes/_testUtils.ts";
import type { StructuralChange } from "../structuralProjection.ts";

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
  it("renders semantic component prop intent at the invocation callsite", () => {
    const change = makeComponentChange();
    const out = generatePrompt([change]);
    expect(out).toContain("## Component prop changes");
    expect(out).toContain("### Button invocation (src/App.tsx:12:4)");
    expect(out).toContain("`variant`: `primary` → `secondary` — replace the invocation prop literal");
    expect(out).toContain("Component contract: `src/ui/Button#Button`");
    expect(out).toContain("Component callsite: `src/App.tsx:12:4` (`Button`)");
    expect(out).toContain('[data-cid="Button"][data-src*="src/App.tsx:12"]');
    expect(out).not.toContain("component-callsite:");
  });

  it("keeps an explicit repeated-output scope and bounded evidence in component prompts", () => {
    const out = generatePrompt([makeComponentChange({
      property: "label",
      before: { kind: "value", value: "Repeated literal" },
      after: "All outputs",
      scope: "source-site",
      evidence: {
        occurrence: 1,
        props: 'label:"Repeated literal"',
        ariaLabel: null,
        beforeText: "Repeated literal",
        mountedCount: 2,
      },
    })]);
    expect(out).toContain("scope: all outputs at this source site");
    expect(out).toContain("Rendered evidence: 2 mounted outputs");
    expect(out).not.toContain("Rendered occurrence");
    expect(out).toContain('Props evidence: `label:"Repeated literal"`');
    expect(out).toContain("Before text: `Repeated literal`");
  });

  it("keeps primitive children authorship guidance in the semantic prompt", () => {
    const change = makeComponentChange({
      property: "children",
      before: { kind: "value", value: "Save" },
      after: "Publish",
      authoredAs: "expression",
      target: { componentName: "Badge" },
    });
    const out = generatePrompt([change]);
    expect(out).toContain("### Badge invocation");
    expect(out).toContain("`children`: `Save` → `Publish` — preserve the authored expression and update its source logic");
    expect(out).toContain("Component callsite:");
  });

  it("tells the agent to replace literal child text", () => {
    const change = makeComponentChange({
      property: "children",
      before: { kind: "value", value: "Save" },
      after: "Publish",
      authoredAs: "literal",
      target: { componentName: "Badge" },
    });
    const out = generatePrompt([change]);
    expect(out).toContain("`children`: `Save` → `Publish` — replace the literal child text");
    expect(out).not.toContain("children`: `Save` → `Publish` — replace the invocation prop literal");
  });

  it("fences rendered text containing backticks, tildes, and newlines", () => {
    const change: TextContentChangeRecord = {
      kind: "text-content",
      id: "text-escape",
      target: {
        sourceSite: { cid: "Copy", src: "src/Copy.tsx:8:3" },
        occurrence: 0,
        props: null,
        ariaLabel: null,
        beforeText: "before `tick`\nnext",
      },
      source: { file: "src/Copy.tsx", line: 8, column: 3, component: "Copy" },
      selector: '[data-cid="Copy"][data-src*="src/Copy.tsx:8:3"]',
      before: "before `tick`\nnext",
      after: "after ~~~\nnext",
      authoredAs: "literal",
    };
    const out = generatePrompt([change]);

    expect(out).toContain("~~~text\nbefore `tick`\nnext\n~~~");
    expect(out).toContain("~~~~text\nafter ~~~\nnext\n~~~~");
  });

  it("renders structural intent as concise source-edit instructions", () => {
    const structural: StructuralChange[] = [
      {
        id: "delete-1",
        kind: "delete",
        target: {
          sourceSite: { cid: "RepeatedItem", src: "src/App.tsx:12:5" },
          locator: { kind: "evidence", occurrence: 2, props: '{"label":"Three"}', text: "Repeated 3" },
        },
      },
      {
        id: "move-1",
        kind: "move",
        target: {
          sourceSite: { cid: "NavItem", src: "src/Nav.tsx:8:3" },
          locator: { kind: "evidence", occurrence: 2, props: null, text: "Docs" },
        },
        destination: {
          parent: {
            sourceSite: { cid: "Navigation", src: "src/Nav.tsx:4:1" },
            locator: { kind: "evidence", occurrence: 0, props: null, text: "Home Docs Blog" },
          },
          before: {
            sourceSite: { cid: "NavItem", src: "src/Nav.tsx:8:3" },
            locator: { kind: "evidence", occurrence: 1, props: null, text: "Blog" },
          },
        },
        presentation: { parentTag: "nav", fromIndex: 3, toIndex: 2 },
      },
    ];

    const out = generatePrompt([], undefined, structural);

    expect(out).toContain("## Structural changes");
    expect(out).toContain("- Remove text `Repeated 3` (src/App.tsx:12:5) from the source.");
    expect(out).toContain("- Move text `Docs` (src/Nav.tsx:8:3) before text `Blog` (src/Nav.tsx:8:3) in Navigation (src/Nav.tsx:4:1).");
    expect(out).not.toContain("rendered occurrence");
    expect(out).not.toContain("Presentation:");
    expect(out).toContain('[data-cid="RepeatedItem"][data-src*="src/App.tsx:12:5"]');
    expect(out).not.toContain("data-dt-projection-instance");
    expect(out).not.toContain("elementId");
  });

  it("exports only the final destination for each moved element", () => {
    const target = {
      sourceSite: { cid: "App", src: "src/App.tsx:157:14" },
      locator: { kind: "evidence" as const, occurrence: 0, props: null, text: "Column two" },
    };
    const parent = {
      sourceSite: { cid: "App", src: "src/App.tsx:150:12" },
      locator: { kind: "evidence" as const, occurrence: 0, props: "className:grid", text: "Grid" },
    };
    const structural: StructuralChange[] = [
      {
        id: "move-1",
        kind: "move",
        target,
        destination: {
          parent,
          before: {
            sourceSite: { cid: "App", src: "src/App.tsx:156:14" },
            locator: { kind: "evidence", occurrence: 0, props: "className:divider", text: null },
          },
        },
        presentation: { parentTag: "div", fromIndex: 2, toIndex: 1 },
      },
      {
        id: "move-2",
        kind: "move",
        target,
        destination: {
          parent,
          before: {
            sourceSite: { cid: "App", src: "src/App.tsx:162:14" },
            locator: { kind: "evidence", occurrence: 0, props: "className:divider", text: null },
          },
        },
        presentation: { parentTag: "div", fromIndex: 1, toIndex: 3 },
      },
      {
        id: "move-3",
        kind: "move",
        target,
        destination: {
          parent,
          before: {
            sourceSite: { cid: "App", src: "src/App.tsx:151:14" },
            locator: { kind: "evidence", occurrence: 0, props: "className:column", text: "Column one" },
          },
        },
        presentation: { parentTag: "div", fromIndex: 3, toIndex: 0 },
      },
    ];

    const out = generatePrompt([], undefined, structural);

    expect(out.split("\n").filter((line) => line.startsWith("- Move text `Column two`"))).toHaveLength(1);
    expect(out).toContain("before text `Column one` (src/App.tsx:151:14)");
    expect(out).not.toContain("src/App.tsx:156:14");
    expect(out).not.toContain("src/App.tsx:162:14");
    expect(out).toContain('[data-cid="App"][data-src*="src/App.tsx:157:14"]');
    expect(out).not.toContain('[data-cid="App"][data-src*="src/App.tsx:150:12"]');
  });

  it("omits a single-target move sequence that returns to its starting position", () => {
    const target = {
      sourceSite: { cid: "App", src: "src/App.tsx:153:16" },
      locator: { kind: "evidence" as const, occurrence: 0, props: null, text: "Heading" },
    };
    const parent = {
      sourceSite: { cid: "App", src: "src/App.tsx:151:14" },
      locator: { kind: "evidence" as const, occurrence: 0, props: "className:column", text: "Column" },
    };
    const structural: StructuralChange[] = [
      {
        id: "move-heading-to-end",
        kind: "move",
        target,
        destination: { parent, before: null },
        presentation: { parentTag: "article", fromIndex: 1, toIndex: 2 },
      },
      {
        id: "move-heading-home",
        kind: "move",
        target,
        destination: {
          parent,
          before: {
            sourceSite: { cid: "App", src: "src/App.tsx:154:16" },
            locator: { kind: "evidence", occurrence: 0, props: null, text: "Body" },
          },
        },
        presentation: { parentTag: "article", fromIndex: 2, toIndex: 1 },
      },
    ];

    const out = generatePrompt([rec({
      cid: "App",
      file: "src/App.tsx",
      line: 153,
      property: "font-weight",
      oldRawValue: "600",
      rawValue: "700",
    })], undefined, structural);

    expect(out).not.toContain("## Structural changes");
    expect(out).not.toContain("src/App.tsx:153:16");
    expect(out).toContain("- `font-weight`: `600` → `700`");
    expect(generatePrompt([], undefined, structural)).toBe(
      "<!-- No changes to export -->\n\nThe changes log is empty. Make a change in the Design Tool inspector first.",
    );
  });

  it("uses exact source coordinates for static HTML changes", () => {
    const change = rec({
      cid: "html:button",
      file: "index.html",
      line: 3,
      column: 17,
      property: "color",
      rawValue: "blue",
      selector: '[data-cid="html:button"][data-src="index.html:3:17"]',
    });

    const out = generatePrompt([change], {
      framework: "HTML",
      stylingSystem: "CSS custom properties",
    });

    expect(out).not.toContain("Framework:");
    expect(out).toContain("### html:button (index.html:3:17)");
    expect(out).toContain('[data-cid="html:button"][data-src="index.html:3:17"]');
    expect(out).not.toContain('data-src*="index.html:3"');
  });

  it("describes runtime-created HTML with bounded rendered evidence", () => {
    const out = generatePrompt([rec({
      cid: "design-tool-runtime-1",
      file: "",
      line: 0,
      column: 0,
      property: "color",
      rawValue: "red",
      selector: '[data-cid="design-tool-runtime-1"][data-src="design-tool:unknown:1"]',
      source: { file: "", line: 0, component: "design-tool-runtime-1" },
      runtimeEvidence: {
        tagName: "button",
        text: "Save",
        props: null,
        ariaLabel: "Save action",
      },
    })], { framework: "HTML", stylingSystem: "CSS custom properties" });

    expect(out).toContain("source unknown; runtime-created DOM");
    expect(out).toContain("Rendered element: `<button>`");
    expect(out).toContain("Text evidence: `Save`");
    expect(out).toContain("Accessible name evidence: `Save action`");
    expect(out).toContain('[data-cid="design-tool-runtime-1"][data-src="design-tool:unknown:1"]');
    expect(out).not.toContain("(:0");
  });

  it("bounds and fences arbitrary runtime evidence values", () => {
    const props = "props `with` backticks\n~~~\n" + "p".repeat(140);
    const ariaLabel = "accessible `name`\n" + "a".repeat(140);
    const out = generatePrompt([rec({
      cid: "design-tool-runtime-2",
      file: "",
      line: 0,
      column: 0,
      property: "color",
      rawValue: "red",
      selector: '[data-cid="design-tool-runtime-2"][data-src="design-tool:unknown:2"]',
      source: { file: "", line: 0, component: "design-tool-runtime-2" },
      runtimeEvidence: {
        tagName: "CUSTOM-ELEMENT",
        text: "  Save\n   now  ",
        props,
        ariaLabel,
      },
    })], { framework: "HTML", stylingSystem: "CSS custom properties" });

    expect(out).toContain("Rendered element: `<custom-element>`");
    expect(out).toContain("Text evidence: `Save now`");
    expect(out).toContain("Props evidence: ~~~~text");
    expect(out).toContain("Accessible name evidence: ~~~text");
    expect(out).toContain(props.slice(0, 120));
    expect(out).toContain(ariaLabel.slice(0, 120));
    expect(out).not.toContain(props.slice(0, 121));
    expect(out).not.toContain(ariaLabel.slice(0, 121));
  });

  it("uses exact structural source fallbacks for static HTML", () => {
    const structural: StructuralChange[] = [{
      id: "delete-html",
      kind: "delete",
      target: {
        sourceSite: { cid: "html:item", src: "index.html:12:5" },
        locator: { kind: "evidence", occurrence: 0, props: null, text: "Item" },
      },
    }];

    const out = generatePrompt(
      [],
      { framework: "HTML", stylingSystem: "CSS custom properties" },
      structural,
    );

    expect(out).toContain('[data-cid="html:item"][data-src="index.html:12:5"]');
    expect(out).not.toContain('data-src*="index.html:12:5"');
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
    expect(out).toContain("# Requested design changes");
    expect(out).not.toContain("Framework:");
    expect(out).toContain("## Changes");
    expect(out).toContain("### Button (src/Button.tsx:42)");
    expect(out).toContain("- `background`: `--color-surface-raised` → `--color-surface-sunken`");
    expect(out).toContain("## Selectors (fallback)");
    expect(out).toContain('- `[data-cid="Button"][data-src*="src/Button.tsx:42"]');
  });

  it("renders a raw value edit without token advice", () => {
    const r = rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "padding",
      rawValue: "16px",
      oldRawValue: "4px",
    });
    const out = generatePrompt([r]);
    expect(out).toContain("- `padding`: `4px` → `16px`");
    expect(out).not.toContain("consider adding");
  });

  it("describes token swaps with the exact value the projection writes", () => {
    // Tailwind-v3-style adapter token: literal cssValue, no custom-property
    // name. The preview applies `0.75rem`; the prompt must not say
    // var(theme.spacing.3), which is not valid CSS.
    const tw3: TokenEntry = { ...SPACE_3, cssValue: "0.75rem" };
    const outV3 = generatePrompt([rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "padding",
      newToken: tw3,
    })]);
    expect(outV3).toContain("- `padding`: `0.75rem`");

    // vanilla-extract-style adapter token: dotted author name plus hashed
    // cssName. The preview applies var(--color-accent__hash).
    const ve: TokenEntry = {
      name: "theme.color.accent",
      value: "#123456",
      source: "theme.css.ts:1",
      cssName: "--color-accent__hash",
    };
    const outVe = generatePrompt([rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "color",
      newToken: ve,
    })]);
    expect(outVe).toContain("- `color`: `var(--color-accent__hash)`");
    expect(outVe).not.toContain("var(theme.color.accent)");
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
    expect(out).toContain("- `padding`: `16px`");
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
    expect(out).toContain("- `border-radius`: `8px` → `var(--space-3)`");
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
    expect(out).toContain("- `border-radius`: `12px`");
    const selectorLines = out.split("\n").filter((l) => l.startsWith("- `[data-cid=\"Button\"]"));
    expect(selectorLines).toHaveLength(1);
  });

  it("keeps CSS overrides for separate rendered instances in separate prompt groups", () => {
    const first = rec({
      cid: "RepeatedItem",
      file: "src/App.tsx",
      property: "color",
      rawValue: "red",
      scope: "rendered-instance",
      instanceOverride: {
        id: "override-first",
        target: {
          sourceSite: { cid: "RepeatedItem", src: "src/App.tsx:12:5" },
          locator: { kind: "evidence", occurrence: 0, props: null, text: "First", ariaLabel: null },
        },
      },
    });
    const second = rec({
      cid: "RepeatedItem",
      file: "src/App.tsx",
      property: "color",
      rawValue: "blue",
      scope: "rendered-instance",
      instanceOverride: {
        id: "override-second",
        target: {
          sourceSite: { cid: "RepeatedItem", src: "src/App.tsx:12:5" },
          locator: { kind: "evidence", occurrence: 1, props: null, text: "Second", ariaLabel: null },
        },
      },
    });

    const out = generatePrompt([first, second]);
    expect(out).toContain("Applies only to text `First`");
    expect(out).toContain("Applies only to text `Second`");
    expect(out.split("\n").filter((line) => line.startsWith("### RepeatedItem"))).toHaveLength(2);
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
    expect(out).toContain("- `padding`: `4px` → `16px`");
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

  it("does not surface framework hints in the prompt", () => {
    const r = rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "background",
      oldToken: SURFACE_RAISED,
      newToken: SURFACE_SUNKEN,
    });
    const out = generatePrompt([r], { framework: "React", stylingSystem: "vanilla-extract (sprinkles)" });
    expect(out).not.toContain("Framework:");
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
