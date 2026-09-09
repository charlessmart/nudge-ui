// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  swapToken,
  promoteToToken,
  setStyle,
  setStyles,
  canEditStyles,
  buildSelector,
  resetPendingRules,
  getPendingRules,
  getChangeRecords,
} from "./editActions.ts";
import type { TokenEntry } from "virtual:design-tokens";
import { setActiveStyleState } from "../shell/styleState.ts";
import { getManagedSheetText } from "../projection/managedStylesheet.ts";
import { installStaticHtmlRuntimeIdentity } from "../runtime/staticHtmlRuntimeIdentity.ts";
import { resetRenderedInstanceState } from "../projection/renderedInstance.ts";

function makeButton(cid = "Button", src = "src/Button.tsx:1:1"): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.setAttribute("data-cid", cid);
  btn.setAttribute("data-src", src);
  document.body.appendChild(btn);
  return btn;
}

const COLOR_BLUE: TokenEntry = { name: "--color-blue", value: "#0000ff", source: "styles.css:1" };
const COLOR_SUNKEN: TokenEntry = { name: "--color-surface-sunken", value: "#f5f5f5", source: "styles.css:2" };
const COLOR_RAISED: TokenEntry = { name: "--color-surface-raised", value: "#ffffff", source: "styles.css:3" };
const SPACE_2: TokenEntry = { name: "--space-2", value: "8px", source: "styles.css:7" };
const SPRINKLES_BRAND: TokenEntry = { name: "theme.color.brand", cssName: "--color-brand__hash", value: "#123456", source: "theme-contract.ts:1", adapter: "vanilla-extract", origin: "project" };
const TAILWIND_V3_SPACE: TokenEntry = { name: "theme.spacing.3", value: "0.75rem", cssValue: "0.75rem", source: "tailwind.config.js:1", adapter: "tailwind-v3", origin: "project" };

describe("buildSelector", () => {
  it("composes [data-cid=...][data-src=...] from the complete injected source identity", () => {
    expect(buildSelector("Button", "src/Button.tsx:42:8")).toBe(
      '[data-cid="Button"][data-src="src/Button.tsx:42:8"]',
    );
  });

  it("returns null when cid is empty", () => {
    expect(buildSelector("", "src/x.tsx:1:1")).toBeNull();
  });

  it("uses the complete src when it does not match line:col", () => {
    expect(buildSelector("App", "App.tsx")).toBe('[data-cid="App"][data-src="App.tsx"]');
  });

  it("keeps separate JSX elements on the same line independently targetable", () => {
    const a = buildSelector("Button", "src/Button.tsx:1:1");
    const b = buildSelector("Button", "src/Button.tsx:1:5");
    expect(a).not.toBe(b);
    expect(a).toBe('[data-cid="Button"][data-src="src/Button.tsx:1:1"]');
    expect(b).toBe('[data-cid="Button"][data-src="src/Button.tsx:1:5"]');
  });
});

describe("swapToken", () => {
  beforeEach(() => {
    setActiveStyleState("base");
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("nudge-ui-styles")?.remove();
  });
  afterEach(() => {
    setActiveStyleState("base");
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("nudge-ui-styles")?.remove();
  });

  it("writes a rule keyed by [data-cid][data-src*] mapping property to var(name)", () => {
    const btn = makeButton();
    swapToken(btn, "background", COLOR_BLUE, COLOR_RAISED);
    const text = getManagedSheetText();
    expect(text).toContain('[data-cid="Button"][data-src="src/Button.tsx:1:1"]');
    expect(text).toContain("background: var(--color-blue);");
  });

  it("writes the generated CSS variable while keeping the contract path in the change record", () => {
    const btn = makeButton();
    const rec = swapToken(btn, "color", SPRINKLES_BRAND, null);
    expect(rec?.newToken?.name).toBe("theme.color.brand");
    expect(getManagedSheetText()).toContain("color: var(--color-brand__hash);");
  });

  it("uses a config token's literal CSS value when Tailwind v3 has no emitted custom property", () => {
    const btn = makeButton();
    const rec = swapToken(btn, "padding-top", TAILWIND_V3_SPACE, null);
    expect(rec?.newToken?.name).toBe("theme.spacing.3");
    expect(getManagedSheetText()).toContain("padding-top: 0.75rem;");
  });

  it("writes a state-qualified selector and preserves the state on the change", () => {
    const btn = makeButton();
    setActiveStyleState("hover");
    const rec = swapToken(btn, "background", COLOR_BLUE, COLOR_RAISED);
    expect(rec?.state).toBe("hover");
    expect(rec?.selector).toContain(':hover');
    expect(getManagedSheetText()).toContain(':hover');
  });

  it("recorded change record carries cid, file, selector, property, old/new token", () => {
    const btn = makeButton();
    const rec = swapToken(btn, "background", COLOR_BLUE, COLOR_RAISED);
    expect(rec).not.toBeNull();
    expect(rec!.cid).toBe("Button");
    expect(rec!.file).toBe("src/Button.tsx");
    expect(rec!.selector).toBe('[data-cid="Button"][data-src="src/Button.tsx:1:1"]');
    expect(rec!.property).toBe("background");
    expect(rec!.newToken!.name).toBe("--color-blue");
    expect(rec!.oldToken?.name).toBe("--color-surface-raised");
  });

  it("called twice for the same element+property overwrites (one rule in the sheet)", () => {
    const btn = makeButton();
    swapToken(btn, "background", COLOR_BLUE, null);
    swapToken(btn, "background", COLOR_SUNKEN, COLOR_BLUE);
    const rules = getPendingRules();
    expect(rules).toHaveLength(1);
    const text = getManagedSheetText() ;
    expect(text).toContain("background: var(--color-surface-sunken);");
    expect(text).not.toContain("var(--color-blue)");
  });

  it("different properties on the same element produce two rules", () => {
    const btn = makeButton();
    swapToken(btn, "background", COLOR_BLUE, null);
    swapToken(btn, "border-radius", SPACE_2, null);
    expect(getPendingRules()).toHaveLength(2);
    const text = getManagedSheetText() ;
    expect(text).toContain("background: var(--color-blue);");
    expect(text).toContain("border-radius: var(--space-2);");
  });

  it("different elements produce independent rules", () => {
    const a = makeButton("Button", "src/Button.tsx:1:1");
    const b = makeButton("App", "src/App.tsx:5:3");
    swapToken(a, "background", COLOR_BLUE, null);
    swapToken(b, "background", COLOR_SUNKEN, null);
    expect(getPendingRules()).toHaveLength(2);
  });
});

describe("promoteToToken", () => {
  beforeEach(() => {
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("nudge-ui-styles")?.remove();
  });
  afterEach(() => {
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("nudge-ui-styles")?.remove();
  });

  it("promotes a hardcoded border-radius 8px to a token (oldToken is null)", () => {
    const btn = makeButton();
    const rec = promoteToToken(btn, "border-radius", SPACE_2);
    expect(rec).not.toBeNull();
    expect(rec!.oldToken).toBeNull();
    expect(rec!.newToken!.name).toBe("--space-2");
    const text = getManagedSheetText() ;
    expect(text).toContain("border-radius: var(--space-2);");
  });

  it("records the change in the change log with oldToken null", () => {
    const btn = makeButton();
    promoteToToken(btn, "cursor", SPACE_2);
    const recs = getChangeRecords();
    expect(recs).toHaveLength(1);
    expect("oldToken" in recs[0]! ? recs[0]!.oldToken : undefined).toBeNull();
    expect(recs[0]!.property).toBe("cursor");
  });
});

describe("group style edits", () => {
  beforeEach(() => {
    resetPendingRules();
    resetRenderedInstanceState();
    document.body.innerHTML = "";
    document.getElementById("nudge-ui-styles")?.remove();
  });

  it("targets distinguishable members of a partial repeated group by rendered instance", () => {
    const first = makeButton("Item", "src/Item.tsx:4:3");
    first.textContent = "First";
    const second = makeButton("Item", "src/Item.tsx:4:3");
    second.textContent = "Second";
    const third = makeButton("Item", "src/Item.tsx:4:3");
    third.textContent = "Third";

    const records = setStyles([first, second], [{ property: "color", value: "red" }]);

    expect(records).toHaveLength(2);
    expect(records.every((record) => record.scope === "rendered-instance")).toBe(true);
    expect(getChangeRecords()).toHaveLength(2);
  });

  it("uses source scope when every member of a repeated group is selected", () => {
    const elements = ["First", "Second", "Third"].map((text) => {
      const element = makeButton("Item", "src/Item.tsx:4:3");
      element.textContent = text;
      return element;
    });

    const records = setStyles(elements, [{ property: "color", value: "red" }]);

    expect(records).toHaveLength(3);
    expect(records.every((record) => record.scope === "source-site")).toBe(true);
  });

  it("rejects an indistinguishable partial repeated group without recording a change", () => {
    const elements = Array.from({ length: 3 }, () => makeButton("Item", "src/Item.tsx:4:3"));
    const target = elements.slice(0, 2);

    expect(canEditStyles(target)).toBe(false);
    expect(setStyles(target, [{ property: "color", value: "red" }])).toEqual([]);
    expect(getChangeRecords()).toEqual([]);
  });
});

describe("runtime HTML evidence", () => {
  it("uses unknown-source evidence when generated identity fills a missing cid", async () => {
    document.body.innerHTML = "";
    const dispose = installStaticHtmlRuntimeIdentity();
    const button = document.createElement("button");
    button.setAttribute("data-src", "author.html:4:2");
    button.setAttribute("data-cprops", "  prop:`value`\n" + "x".repeat(140));
    button.setAttribute("aria-label", "  Save\n  this action  ");
    button.textContent = "  Save\n   this   action  ";
    document.body.append(button);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    const record = setStyle(button, "color", "red");
    dispose();

    expect(record?.file).toBe("");
    expect(record?.line).toBe(0);
    expect(record?.column).toBe(0);
    expect(record?.selector).toBe('[data-cid="nudge-ui-runtime-1"][data-src="author.html:4:2"]');
    expect(record?.runtimeEvidence).toEqual({
      reason: "runtime-created",
      tagName: "button",
      text: "Save this action",
      props: ("  prop:`value`\n" + "x".repeat(140)).slice(0, 120),
      ariaLabel: "  Save\n  this action  ",
    });
  });

  it("uses unannotated-source evidence when authored markup has no usable data-src", () => {
    // Degraded Astro identity (ADR-0011): server-rendered markup with a
    // generated cid and no source annotation. Prompts must treat the
    // location as unknown, not fabricate `file:0`.
    const heading = document.createElement("h1");
    heading.setAttribute("data-cid", "astro:H1");
    heading.textContent = "About the studio";
    document.body.append(heading);

    const record = setStyle(heading, "color", "blue");

    expect(record?.file).toBe("");
    expect(record?.line).toBe(0);
    expect(record?.column).toBe(0);
    expect(record?.runtimeEvidence).toEqual({
      reason: "unannotated",
      tagName: "h1",
      text: "About the studio",
      props: null,
      ariaLabel: null,
    });
  });
});
