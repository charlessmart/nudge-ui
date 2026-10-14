// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { countPromptChanges, generatePrompt } from "./generatePrompt.ts";
import { detectFramework } from "./detectFramework.ts";
import type { ElementChangeRecord, TextContentChangeRecord } from "../changes/types.ts";
import type { TokenEntry } from "../../css/model/index.ts";
import { makeComponentChange } from "../changes/_testUtils.ts";
import type { StructuralChange } from "../projection/structuralProjection.ts";
import type { AgentSketchMetadata } from "../agent/protocol.ts";
import { configureNudgeUiRuntime } from "../runtime/runtimeConfig.ts";
import { DEFAULT_CUSTOM_INSTRUCTIONS } from "./promptSettings.ts";

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

/** Mirrors the Astro host Adapter's declared runtime policy (astroRuntimeConfig.ts). */
function configureAstroHost(): void {
  configureNudgeUiRuntime({
    projectId: "prompt-fixture",
    host: "astro",
    framework: "Astro",
    stylingSystem: "CSS custom properties",
    capabilities: {
      canvas: false,
      componentSemantics: true,
      sourceCoordinates: {
        exactCidPrefixes: ["astro:"],
        exactFileExtensions: [".astro", ".html", ".htm"],
      },
    },
    tokenCatalog: [],
    tokens: [],
    tokenDiagnostics: [],
    tokenGeneration: "",
    componentContracts: [],
  });
}

function configureDefaultHost(): void {
  configureNudgeUiRuntime({
    projectId: "prompt-fixture",
    host: "vite-react",
    framework: "React",
    stylingSystem: "CSS custom properties",
    capabilities: { canvas: true, componentSemantics: true },
    tokenCatalog: [],
    tokens: [],
    tokenDiagnostics: [],
    tokenGeneration: "",
    componentContracts: [],
  });
}

afterEach(configureDefaultHost);

describe("generatePrompt", () => {
  it("appends the default custom instructions after the requested changes", () => {
    const out = generatePrompt([makeComponentChange()]);

    expect(out).toContain(`## Custom instructions\n\n${DEFAULT_CUSTOM_INSTRUCTIONS}`);
    expect(out.indexOf("## Custom instructions")).toBeGreaterThan(out.indexOf("## Button component"));
  });

  it("appends supplied custom instructions and allows them to be cleared", () => {
    const custom = "Use the project's existing component patterns.\nKeep the implementation concise.";
    const out = generatePrompt([makeComponentChange()], undefined, [], custom);

    expect(out).toContain(`## Custom instructions\n\n${custom}`);
    expect(out).not.toContain(DEFAULT_CUSTOM_INSTRUCTIONS);
    expect(generatePrompt([makeComponentChange()], undefined, [], "")).not.toContain("## Custom instructions");
  });

  it("renders semantic component prop intent at the invocation callsite", () => {
    const change = makeComponentChange();
    const out = generatePrompt([change]);
    expect(out).not.toContain("## Component prop changes");
    expect(out).toContain("Source: `src/App.tsx:12:4`");
    expect(out).toContain("- **Change:** `variant`: `primary` → `secondary`\n");
    expect(out).not.toContain("replace the invocation prop literal");
    expect(out).toContain("Source: `src/App.tsx:12:4`");
    expect(out).not.toContain("Selectors (fallback)");
    expect(out).not.toContain("data-cid");
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
    expect(out).toContain("Apply to all items rendered at this source location.");
    expect(out).toContain("Rendered instances: 2");
    expect(out).not.toContain("Rendered occurrence");
    expect(out).toContain('Props: `label:"Repeated literal"`');
    expect(out).toContain("Before text: `Repeated literal`");
  });

  it.each(["rendered-instance", "source-site"] as const)("preserves %s scope in component and text requests", (scope) => {
    const component = makeComponentChange({
      property: "label", before: { kind: "value", value: "Repeated literal" }, after: "Updated label", scope,
      evidence: { occurrence: 1, props: null, ariaLabel: null, beforeText: "Repeated literal", mountedCount: 2 },
    });
    const text: TextContentChangeRecord = {
      kind: "text-content", id: "repeated-text",
      target: {
        sourceSite: { cid: "Label", src: "src/App.tsx:12:4" }, occurrence: 1,
        props: null, ariaLabel: null, beforeText: "Repeated literal",
      },
      source: { file: "src/App.tsx", line: 12, column: 4, component: "Label" },
      selector: '[data-cid="Label"]', before: "Repeated literal", after: "Updated label", authoredAs: "literal", scope,
      evidence: { callsiteId: "src/App.tsx:12:4", componentName: "Label", property: "text", mountedCount: 2 },
    };
    const instruction = scope === "rendered-instance"
      ? "Apply to this selected item only; keep other instances unchanged."
      : "Apply to all items rendered at this source location.";

    expect(generatePrompt([component])).toContain(instruction);
    expect(generatePrompt([text])).toContain(instruction);
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
    expect(out).toContain("## Badge component");
    expect(out).toContain("`children`: `Save` → `Publish` — preserve the authored expression and update its source logic");
    expect(out).toContain("## Badge component");
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
        source: {
          parent: {
            sourceSite: { cid: "Navigation", src: "src/Nav.tsx:4:1" },
            locator: { kind: "evidence", occurrence: 0, props: null, text: "Home Docs Blog" },
          },
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
        presentation: { sourceParentTag: "nav", destinationParentTag: "nav", fromIndex: 3, toIndex: 2 },
      },
    ];

    const out = generatePrompt([], undefined, structural);

    expect(out).toContain("## Text: `Repeated 3`");
    expect(out).toContain("- Remove text `Repeated 3` (src/App.tsx:12:5) from the source.");
    expect(out).toContain("- Move text `Docs` (src/Nav.tsx:8:3) before text `Blog` (src/Nav.tsx:8:3) in Navigation (src/Nav.tsx:4:1).");
    expect(out).not.toContain("rendered occurrence");
    expect(out).not.toContain("Presentation:");
    expect(out).not.toContain("data-cid");
    expect(out).not.toContain("data-projection-instance");
    expect(out).not.toContain("elementId");
  });

  it("keeps sketch details out of the text prompt", () => {
    const sketch: AgentSketchMetadata = {
      id: "sketch-checkout",
      revision: 3,
      filename: "sketch-sketch-checkout-r3.png",
      mimeType: "image/png",
      width: 1200,
      height: 800,
      byteSize: 1024,
      capture: {
        url: "http://localhost:5173/checkout?step=2#payment",
        title: "Checkout",
        timestamp: Date.UTC(2026, 0, 2, 3, 4, 5),
        viewportWidth: 1200,
        viewportHeight: 800,
        scrollX: 0,
        scrollY: 240,
        devicePixelRatio: 2,
        host: "vite-react",
        framework: "React",
      },
      description: "Give the payment card more breathing room.",
      annotations: [{ number: 1, description: "Make the Done button more prominent." }],
    };

    const out = generatePrompt([], undefined, [], "Keep the implementation concise.", [sketch]);

    expect(out).not.toContain("Sketch");
    expect(out).not.toContain("Checkout");
    expect(out).not.toContain("Annotation 1: `Make the Done button more prominent.`");
    expect(out).not.toContain("Description: `Give the payment card more breathing room.`");
    expect(out).toContain("## Custom instructions\n\nKeep the implementation concise.");
    expect(out).not.toContain("sketch-sketch-checkout-r3.png");
    expect(out).not.toContain("Sketch ID");
    expect(out).not.toContain("Captured route");
    expect(out).not.toContain("Viewport");
    expect(out).not.toContain("Runtime");
    expect(out).not.toContain("No changes to export");
  });

  it("describes a cross-container move with source and destination sites", () => {
    const structural: StructuralChange[] = [{
      id: "move-cross",
      kind: "move",
      target: {
        sourceSite: { cid: "NavItem", src: "src/Nav.tsx:8:3" },
        locator: { kind: "evidence", occurrence: 0, props: null, text: "Docs" },
      },
      source: {
        parent: {
          sourceSite: { cid: "Navigation", src: "src/Nav.tsx:4:1" },
          locator: { kind: "evidence", occurrence: 0, props: null, text: "Home Docs" },
        },
      },
      destination: {
        parent: {
          sourceSite: { cid: "FooterLinks", src: "src/Footer.tsx:9:3" },
          locator: { kind: "evidence", occurrence: 0, props: null, text: "Blog" },
        },
        before: {
          sourceSite: { cid: "FooterItem", src: "src/Footer.tsx:10:5" },
          locator: { kind: "evidence", occurrence: 0, props: null, text: "Blog" },
        },
      },
      presentation: { sourceParentTag: "nav", destinationParentTag: "aside", fromIndex: 1, toIndex: 1 },
    }];

    expect(generatePrompt([], undefined, structural)).toContain(
      "- Move text `Docs` (src/Nav.tsx:8:3) from Navigation (src/Nav.tsx:4:1) into FooterLinks (src/Footer.tsx:9:3), before text `Blog` (src/Footer.tsx:10:5).",
    );
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
        source: { parent },
        destination: {
          parent,
          before: {
            sourceSite: { cid: "App", src: "src/App.tsx:156:14" },
            locator: { kind: "evidence", occurrence: 0, props: "className:divider", text: null },
          },
        },
        presentation: { sourceParentTag: "div", destinationParentTag: "div", fromIndex: 2, toIndex: 1 },
      },
      {
        id: "move-2",
        kind: "move",
        target,
        source: { parent },
        destination: {
          parent,
          before: {
            sourceSite: { cid: "App", src: "src/App.tsx:162:14" },
            locator: { kind: "evidence", occurrence: 0, props: "className:divider", text: null },
          },
        },
        presentation: { sourceParentTag: "div", destinationParentTag: "div", fromIndex: 1, toIndex: 3 },
      },
      {
        id: "move-3",
        kind: "move",
        target,
        source: { parent },
        destination: {
          parent,
          before: {
            sourceSite: { cid: "App", src: "src/App.tsx:151:14" },
            locator: { kind: "evidence", occurrence: 0, props: "className:column", text: "Column one" },
          },
        },
        presentation: { sourceParentTag: "div", destinationParentTag: "div", fromIndex: 3, toIndex: 0 },
      },
    ];

    const out = generatePrompt([], undefined, structural);

    expect(out.split("\n").filter((line) => line.startsWith("- Move text `Column two`"))).toHaveLength(1);
    expect(countPromptChanges([], structural)).toBe(1);
    expect(countPromptChanges([], structural, 2)).toBe(3);
    expect(structural).toHaveLength(3);
    expect(out).toContain("before text `Column one` (src/App.tsx:151:14)");
    expect(out).not.toContain("src/App.tsx:156:14");
    expect(out).not.toContain("src/App.tsx:162:14");
    expect(out).not.toContain("data-cid");
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
        source: { parent },
        destination: { parent, before: null },
        presentation: { sourceParentTag: "article", destinationParentTag: "article", fromIndex: 1, toIndex: 2 },
      },
      {
        id: "move-heading-home",
        kind: "move",
        target,
        source: { parent },
        destination: {
          parent,
          before: {
            sourceSite: { cid: "App", src: "src/App.tsx:154:16" },
            locator: { kind: "evidence", occurrence: 0, props: null, text: "Body" },
          },
        },
        presentation: { sourceParentTag: "article", destinationParentTag: "article", fromIndex: 2, toIndex: 1 },
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
    expect(out).toContain("- **Change:** `font-weight`: `600` → `700`");
    expect(generatePrompt([], undefined, structural)).toBe(
      "<!-- No changes to export -->\n\nThe changes log is empty. Make a change in the Nudge UI inspector first.",
    );
  });

  it("omits a cross-container sequence only when it returns to the initial parent position", () => {
    const target = {
      sourceSite: { cid: "Item", src: "src/App.tsx:20:5" },
      locator: { kind: "evidence" as const, occurrence: 0, props: null, text: "Docs" },
    };
    const source = {
      sourceSite: { cid: "Navigation", src: "src/Nav.tsx:4:1" },
      locator: { kind: "evidence" as const, occurrence: 0, props: null, text: "Home Docs" },
    };
    const middle = {
      sourceSite: { cid: "FooterLinks", src: "src/Footer.tsx:9:3" },
      locator: { kind: "evidence" as const, occurrence: 0, props: null, text: "Blog" },
    };
    const structural: StructuralChange[] = [
      {
        id: "move-out",
        kind: "move",
        target,
        source: { parent: source },
        destination: { parent: middle, before: null },
        presentation: { sourceParentTag: "nav", destinationParentTag: "aside", fromIndex: 1, toIndex: 0 },
      },
      {
        id: "move-home",
        kind: "move",
        target,
        source: { parent: middle },
        destination: {
          parent: {
            ...source,
            locator: { ...source.locator, text: "Home" },
          },
          before: {
            sourceSite: { cid: "NavItem", src: "src/Nav.tsx:8:3" },
            locator: { kind: "evidence", occurrence: 0, props: null, text: "Docs" },
          },
        },
        presentation: { sourceParentTag: "aside", destinationParentTag: "nav", fromIndex: 0, toIndex: 1 },
      },
    ];

    expect(generatePrompt([], undefined, structural)).toBe(
      "<!-- No changes to export -->\n\nThe changes log is empty. Make a change in the Nudge UI inspector first.",
    );
  });

  it("keeps authored columns for JSX sources under hosts that declare no policy", () => {
    // Vite and Next capture data-src before React's transform, so JSX columns stay exact.
    const out = generatePrompt([rec({
      cid: "Counter",
      file: "src/components/Counter.tsx",
      line: 14,
      column: 9,
      property: "color",
      rawValue: "blue",
      selector: '[data-cid="Counter"][data-src="src/components/Counter.tsx:14:9"]',
    })]);

    expect(out).toContain("Source: `src/components/Counter.tsx:14:9`");
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
    expect(out).toContain("Source: `index.html:3:17`");
    expect(out).not.toContain("data-cid");
  });

  it("keys exact source coordinates off each element's identity origin, not the document framework", () => {
    configureAstroHost();
    const change = rec({
      cid: "astro:H1",
      file: "src/pages/about.astro",
      line: 12,
      column: 7,
      property: "color",
      rawValue: "blue",
      selector: '[data-cid="astro:H1"][data-src="src/pages/about.astro:12:7"]',
    });

    const out = generatePrompt([change], {
      framework: "Astro",
      stylingSystem: "CSS custom properties",
    });

    expect(out).toContain("Source: `src/pages/about.astro:12:7`");
    expect(out).not.toContain("data-cid");

    // The host-declared policy decides precision, not the document's framework hint.
    const otherFrameworkOut = generatePrompt([change], {
      framework: "React",
      stylingSystem: "CSS custom properties",
    });
    expect(otherFrameworkOut).toContain("Source: `src/pages/about.astro:12:7`");
  });

  it("renders React island JSX elements at line precision inside an Astro document", () => {
    configureAstroHost();
    // Astro island internals are line-precision origins; the document hint must not upgrade them.
    const out = generatePrompt([rec({
      cid: "Counter",
      file: "src/components/Counter.tsx",
      line: 14,
      column: 9,
      property: "color",
      rawValue: "blue",
      selector: '[data-cid="Counter"][data-src="src/components/Counter.tsx:14:9"]',
    })], {
      framework: "Astro",
      stylingSystem: "CSS custom properties",
    });

    expect(out).toContain("Source: `src/components/Counter.tsx:14`");
    expect(out).not.toContain("(src/components/Counter.tsx:14:");
    expect(out).not.toContain("data-cid");
  });

  it("keeps exact coordinates for author-supplied cids on authored static sources", () => {
    configureAstroHost();
    // Precision follows the source file, not the cid: author-written cids keep exact data-src.
    const out = generatePrompt([rec({
      cid: "Hero",
      file: "src/pages/index.astro",
      line: 8,
      column: 3,
      property: "color",
      rawValue: "blue",
      selector: '[data-cid="Hero"][data-src="src/pages/index.astro:8:3"]',
    })], { framework: "Astro", stylingSystem: "CSS custom properties" });

    expect(out).toContain("Source: `src/pages/index.astro:8:3`");
  });

  it("renders text changes on JSX elements at line precision inside an Astro document", () => {
    configureAstroHost();
    const change: TextContentChangeRecord = {
      kind: "text-content",
      id: "text-astro-island",
      target: {
        sourceSite: { cid: "Counter", src: "src/components/Counter.tsx:14:9" },
        occurrence: 0,
        props: null,
        ariaLabel: null,
        beforeText: "Count",
      },
      source: { file: "src/components/Counter.tsx", line: 14, column: 9, component: "Counter" },
      selector: '[data-cid="Counter"][data-src*="src/components/Counter.tsx:14:9"]',
      before: "Count",
      after: "Counter",
      authoredAs: "literal",
    };
    const out = generatePrompt([change], {
      framework: "Astro",
      stylingSystem: "CSS custom properties",
    });

    expect(out).toContain("Source: `src/components/Counter.tsx:14`");
    expect(out).not.toContain("(src/components/Counter.tsx:14:");
  });

  it("identifies unannotated Astro elements by rendered content without fabricating source", () => {
    configureAstroHost();
    // Degraded Astro identity: no annotations, so the prompt must not invent `file:0` or expose selectors.
    const out = generatePrompt([rec({
      cid: "astro:H1",
      file: "",
      line: 0,
      column: 0,
      property: "color",
      rawValue: "blue",
      selector: '[data-cid="astro:H1"]',
      source: { file: "", line: 0, component: "astro:H1" },
      runtimeEvidence: {
        reason: "unannotated",
        tagName: "h1",
        text: "About the studio",
        props: null,
        ariaLabel: null,
      },
    })], { framework: "Astro", stylingSystem: "CSS custom properties" });

    expect(out).toContain("## Heading (`<h1>`)\n");
    expect(out).toContain("Text: `About the studio`");
    expect(out).not.toContain("source unknown");
    expect(out).not.toContain("astro:H1");
    expect(out).not.toContain("(:0");
    expect(out).not.toContain("data-cid");
  });

  it("describes runtime-created HTML with bounded rendered evidence", () => {
    const out = generatePrompt([rec({
      cid: "nudge-ui-runtime-1",
      file: "",
      line: 0,
      column: 0,
      property: "color",
      rawValue: "red",
      selector: '[data-cid="nudge-ui-runtime-1"][data-src="nudge-ui:unknown:1"]',
      source: { file: "", line: 0, component: "nudge-ui-runtime-1" },
      runtimeEvidence: {
        tagName: "button",
        domPath: "main > button.save",
        text: "Save",
        props: null,
        ariaLabel: "Save action",
      },
    })], { framework: "HTML", stylingSystem: "CSS custom properties" });

    expect(out).toContain("## Button (`<button>`)\n");
    expect(out).toContain("Text: `Save`");
    expect(out).toContain("Accessible name: `Save action`");
    expect(out).toContain("DOM path: `main > button.save`");
    expect(out).toContain("- **Change:** `color`: `red`");
    expect(out).not.toContain("nudge-ui-runtime-");
    expect(out).not.toContain("nudge-ui:unknown:");
    expect(out).not.toContain("Source: unknown");
    expect(out).not.toContain("source unknown");
    expect(out).not.toContain("runtime-created DOM");
    expect(out).not.toContain(" · base");
    expect(out).not.toContain("data-cid");
    expect(out).not.toContain("(:0");
  });

  it("preserves hover intent for legacy runtime edits without element evidence", () => {
    const out = generatePrompt([rec({
      cid: "nudge-ui-runtime-9", file: "nudge-ui:unknown:9", line: 0,
      property: "opacity", rawValue: "0.5", state: "hover",
    })]);

    expect(out).toContain("## Element");
    expect(out).toContain("- **Change:** `opacity` (hover): `0.5`");
    expect(out).not.toContain("nudge-ui-runtime-");
    expect(out).not.toContain("nudge-ui:unknown:");
  });

  it("keeps runtime text, removals, and comments readable without generated identities", () => {
    const sourceSite = { cid: "nudge-ui-runtime-7", src: "nudge-ui:unknown:7" };
    const target = {
      sourceSite,
      locator: { kind: "evidence" as const, occurrence: 0, props: null, text: "Save", ariaLabel: "Save action" },
    };
    const change: TextContentChangeRecord = {
      kind: "text-content",
      id: "text-runtime",
      target: { sourceSite, occurrence: 0, props: null, ariaLabel: "Save action", beforeText: "Save" },
      source: { file: sourceSite.src, line: 0, column: 0, component: sourceSite.cid },
      selector: '[data-cid="nudge-ui-runtime-7"]',
      before: "Save",
      after: "Publish",
      authoredAs: "unknown",
    };
    const out = generatePrompt([change], undefined, [{ id: "remove-runtime", kind: "delete", target }], "", [], [{
      id: "comment-runtime", route: "https://example.com/", target, tag: "button", note: "Make this easier to find",
      baseline: "", viewport: "", handedOff: false,
    }]);

    expect(out).toContain("Replace text `Save` with `Publish`");
    expect(out).toContain("Remove text `Save` from the source.");
    expect(out).toContain("Make this easier to find");
    expect(out).toContain("Save action");
    expect(out).not.toContain("nudge-ui-runtime-");
    expect(out).not.toContain("nudge-ui:unknown:");
    expect(out).not.toContain("source unknown");
    expect(out).not.toContain("runtime-created DOM");
  });

  it("bounds and fences arbitrary runtime evidence values", () => {
    const props = "props `with` backticks\n~~~\n" + "p".repeat(140);
    const ariaLabel = "accessible `name`\n" + "a".repeat(140);
    const out = generatePrompt([rec({
      cid: "nudge-ui-runtime-2",
      file: "",
      line: 0,
      column: 0,
      property: "color",
      rawValue: "red",
      selector: '[data-cid="nudge-ui-runtime-2"][data-src="nudge-ui:unknown:2"]',
      source: { file: "", line: 0, component: "nudge-ui-runtime-2" },
      runtimeEvidence: {
        tagName: "CUSTOM-ELEMENT",
        text: "  Save\n   now  ",
        props,
        ariaLabel,
      },
    })], { framework: "HTML", stylingSystem: "CSS custom properties" });

    expect(out).toContain("## Element (`<custom-element>`)");
    expect(out).toContain("Text: `Save now`");
    expect(out).toContain("Props: ~~~~text");
    expect(out).toContain("Accessible name: ~~~text");
    expect(out).toContain(props.slice(0, 120));
    expect(out).toContain(ariaLabel.slice(0, 120));
    expect(out).not.toContain(props.slice(0, 121));
    expect(out).not.toContain(ariaLabel.slice(0, 121));
  });

  it("uses exact structural source coordinates for static HTML", () => {
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

    expect(out).toContain("text `Item` (index.html:12:5)");
    expect(out).not.toContain("data-cid");
  });

  it("returns the empty sentinel when there are no changes", () => {
    const out = generatePrompt([]);
    expect(out).toBe(
      "<!-- No changes to export -->\n\nThe changes log is empty. Make a change in the Nudge UI inspector first.",
    );
  });

  it("uses authored element details without losing source precision or shared scope", () => {
    configureAstroHost();
    const out = generatePrompt([rec({
      cid: "astro:H1", file: "src/pages/about.astro", line: 12, column: 7, property: "font-weight", rawValue: "400",
      sourceEvidence: { tagName: "h1", props: null, text: "  About\n  the studio  ", ariaLabel: "Studio heading", domPath: "main > h1.title" },
    })]);

    expect(out).toContain("## Heading (`<h1>`)");
    expect(out).toContain("Source: `src/pages/about.astro:12:7`");
    expect(out).toContain("Text: `About the studio`");
    expect(out).toContain("Accessible name: `Studio heading`");
    expect(out).toContain("DOM path: `main > h1.title`");
    expect(out).not.toContain("Apply to all instances rendered from this source location.");
    expect(out).toContain("**Change:** `font-weight`: `400`");
    expect(out).not.toContain("data-cid");
  });

  it("uses the type and source from older npm records without inventing rendered text", () => {
    const out = generatePrompt([rec({
      cid: "Hero", file: "src/Hero.tsx", line: 8, column: 3, property: "color", rawValue: "red",
      sourceEvidence: { tagName: "p", props: null },
    })]);

    expect(out).toContain("## Paragraph (`<p>`)");
    expect(out).toContain("Source: `src/Hero.tsx:8:3`");
    expect(out).not.toContain("- Text:");
    expect(out).not.toContain("DOM path:");
  });

  it("groups a runtime heading's style, copy, and note together before the paragraph", () => {
    const sourceSite = { cid: "nudge-ui-runtime-4", src: "nudge-ui:unknown:4" };
    const headingStyle = rec({
      cid: sourceSite.cid, file: "", line: 0, property: "font-weight", oldRawValue: "600", rawValue: "400",
      runtimeEvidence: { tagName: "h1", text: "Original title", domPath: "main > header > h1", props: null, ariaLabel: null },
    });
    const paragraphStyle = rec({
      cid: "nudge-ui-runtime-5", file: "", line: 0, property: "font-size", rawValue: "32px",
      runtimeEvidence: { tagName: "p", text: "Intro copy", domPath: "main > header > p", props: null, ariaLabel: null },
    });
    const copy: TextContentChangeRecord = {
      kind: "text-content", id: "heading-copy", target: { sourceSite, occurrence: 0, props: null, ariaLabel: null, beforeText: "Original title" },
      source: { file: "", line: 0, column: 0, component: sourceSite.cid }, selector: headingStyle.selector,
      before: "Original title", after: "New title", authoredAs: "unknown",
    };
    const out = generatePrompt([headingStyle, paragraphStyle, copy], undefined, [], "", [], [{
      id: "heading-note", route: "https://example.com/", tag: "h1", note: "Keep this on one line",
      target: { sourceSite, locator: { kind: "evidence", occurrence: 0, props: null, text: "New title" } },
      baseline: "", viewport: "", handedOff: false,
    }]);
    const headingBlock = out.slice(out.indexOf("## Heading"), out.indexOf("## Paragraph"));

    expect(headingBlock).toContain("Original title");
    expect(headingBlock).toContain("- **Change:** `font-weight`: `600` → `400`");
    expect(headingBlock).toContain("Replace text `Original title` with `New title`");
    expect(headingBlock).toContain("**Note:** `Keep this on one line`");
    expect(headingBlock).toContain("DOM path: `main > header > h1`");
    expect(out.match(/^## Heading/gm)).toHaveLength(1);
    expect(out).toContain("## Paragraph");
    expect(out).not.toContain("## Rendered text changes");
    expect(out).not.toContain("## Element comments");
    expect(out).not.toContain("nudge-ui-runtime-");
  });

  it("groups npm instance edits and notes without mixing siblings or shared-source edits", () => {
    const sourceSite = { cid: "Button", src: "src/Buttons.tsx:12:5" };
    const first = { sourceSite, locator: { kind: "evidence" as const, occurrence: 0, props: null, text: "First", ariaLabel: null } };
    const second = { sourceSite, locator: { ...first.locator, occurrence: 1, text: "Second" } };
    const firstStyle = rec({
      cid: "Button", file: "src/Buttons.tsx", line: 12, column: 5,
      property: "color", rawValue: "red", scope: "rendered-instance", instanceOverride: { id: "first", target: first },
    });
    const secondStyle = { ...firstStyle, rawValue: "blue", instanceOverride: { id: "second", target: second } };
    const sharedStyle = { ...firstStyle, property: "padding", rawValue: "16px", scope: "source-site" as const, instanceOverride: undefined };
    const copy: TextContentChangeRecord = {
      kind: "text-content", id: "first-copy",
      target: { sourceSite, occurrence: 0, props: null, ariaLabel: null, beforeText: "First" },
      source: { file: "src/Buttons.tsx", line: 12, column: 5, component: "Button" }, selector: firstStyle.selector,
      before: "First", after: "Publish", authoredAs: "expression", scope: "rendered-instance",
    };
    const out = generatePrompt([firstStyle, secondStyle, sharedStyle, copy], undefined, [], "", [], [{
      id: "first-note", route: "https://example.com/", tag: "button", note: "Primary action",
      target: { ...first, locator: { ...first.locator, text: "Publish" } }, baseline: "", viewport: "", handedOff: false,
    }]);
    const blocks = out.split(/^## /m).slice(1);
    const firstBlock = blocks.find((block) => block.includes("`color`: `red`"))!;
    const secondBlock = blocks.find((block) => block.includes("`color`: `blue`"))!;
    const sharedBlock = blocks.find((block) => block.includes("`padding`: `16px`"))!;

    expect(blocks).toHaveLength(3);
    expect(firstBlock.match(/src\/Buttons\.tsx:12:5/g)).toHaveLength(1);
    expect(firstBlock).toContain("Replace text `First` with `Publish`");
    expect(firstBlock).toContain("**Note:** `Primary action`");
    expect(firstBlock).toContain("Apply to this selected item only; keep other instances unchanged.");
    expect(firstBlock).not.toContain("`color`: `blue`");
    expect(secondBlock).toContain("Text: `Second`");
    expect(secondBlock).not.toContain("Applies only");
    expect(secondBlock).not.toContain("Publish");
    expect(sharedBlock).not.toContain("Applies only");
    expect(sharedBlock).not.toContain("Publish");
  });

  it("groups component options for one invocation under one section", () => {
    const variant = makeComponentChange();
    const children = makeComponentChange({ property: "children", before: { kind: "value", value: "Save" }, after: "Publish" });
    const out = generatePrompt([variant, children]);

    expect(out.match(/^## Button component/gm)).toHaveLength(1);
    expect(out).toContain("`variant`: `primary` → `secondary`");
    expect(out).toContain("`children`: `Save` → `Publish`");
    expect(out).not.toContain("apply to all instances rendered from this source location");
  });

  it("keeps base and hover requests explicit inside one element section", () => {
    const base = rec({ cid: "Title", file: "src/Title.tsx", property: "color", rawValue: "red" });
    const hover = { ...base, state: "hover" as const, rawValue: "blue" };
    const out = generatePrompt([base, hover]);

    expect(out.match(/^- Source: `src\/Title.tsx:42`/gm)).toHaveLength(1);
    expect(out).toContain("- **Change:** `color`: `red`");
    expect(out).toContain("- **Change:** `color` (hover): `blue`");
  });

  it("renders a token swap without runtime selectors", () => {
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
    expect(out).not.toContain("## Changes");
    expect(out).toContain("Source: `src/Button.tsx:42`");
    expect(out).toContain("- **Change:** `background`: `--color-surface-raised` → `--color-surface-sunken`");
    expect(out).not.toContain("Selectors (fallback)");
    expect(out).not.toContain("data-cid");
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
    expect(out).toContain("- **Change:** `padding`: `4px` → `16px`");
    expect(out).not.toContain("consider adding");
  });

  it("describes token swaps with the exact value the projection writes", () => {
    // Tailwind-v3-style token with a literal cssValue: the prompt must print `0.75rem`, not invalid var(theme.spacing.3).
    const tw3: TokenEntry = { ...SPACE_3, cssValue: "0.75rem" };
    const outV3 = generatePrompt([rec({
      cid: "Button",
      file: "src/Button.tsx",
      property: "padding",
      newToken: tw3,
    })]);
    expect(outV3).toContain("- **Change:** `padding`: `0.75rem`");

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
    expect(outVe).toContain("- **Change:** `color`: `var(--color-accent__hash)`");
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
    expect(out).toContain("- **Change:** `padding`: `16px`");
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
    expect(out).toContain("- **Change:** `border-radius`: `8px` → `var(--space-3)`");
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
    const headings = out.split("\n").filter((l) => l.startsWith("## Element"));
    expect(headings).toHaveLength(1);
    expect(out).toContain("- **Change:** `background`: `--color-surface-raised` → `--color-surface-sunken`");
    expect(out).toContain("- **Change:** `border-radius`: `12px`");
    expect(out).not.toContain("data-cid");
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
    expect(out).toContain("Text: `First`");
    expect(out).toContain("Text: `Second`");
    expect(out).not.toContain("Applies only");
    expect(out.split("\n").filter((line) => line.startsWith("## Element"))).toHaveLength(2);
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
    expect(out).toContain("Source: `src/Button.tsx:42`");
    expect(out).toContain("Source: `src/components/Header.tsx:58`");
    expect(out).not.toContain("data-cid");
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
    expect(out).toContain("- **Change:** `padding`: `4px` → `16px`");
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
      "- **Change:** `background`: `--color-surface-raised` → `--space-3`",
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
    expect(out).toContain("Source: `src/Button.tsx:42`");
    expect(out).toContain("Source: `src/components/Header.tsx:42`");
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

  it("uses human-readable adapter token names", () => {
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

  it("renders global token edits separately with source and context", () => {
    const out = generatePrompt([{
      kind: "token",
      tokenName: "--color-text",
      file: "src/theme.css",
      line: 6,
      selector: ':root[data-theme="dark"]',
      property: "--color-text",
      rawValue: "var(--color-neutral-100)",
      oldRawValue: "#eeeeee",
      important: false,
      context: {},
      contextLabel: 'root[data-theme="dark"]',
      source: { file: "src/theme.css", line: 6, component: "Global token" },
    }]);
    expect(out).toContain("## Global token changes");
    expect(out).toContain('`--color-text` (root[data-theme="dark"], src/theme.css:6)');
    expect(out).toContain('`#eeeeee` → `var(--color-neutral-100)`');
    expect(out).not.toContain("Selectors (fallback)");
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
