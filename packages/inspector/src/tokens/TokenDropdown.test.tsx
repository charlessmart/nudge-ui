// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { TokenDropdown } from "./TokenDropdown.tsx";
import { getCompatibleTokenCandidates, presentationForToken } from "./compatibility.ts";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "./resolution.ts";
import { resetPendingRules } from "./editActions.ts";
import { selectOptionValues, setSelectValue } from "../styleEditors/_testUtils.ts";
import { getManagedSheetText } from "../managedStylesheet.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ENTRIES: TokenEntry[] = [
  { name: "--color-surface-raised", value: "#ffffff", source: "s:1" },
  { name: "--color-surface-sunken", value: "#f5f5f5", source: "s:2" },
  { name: "--space-1", value: "4px", source: "s:6" },
  { name: "--space-2", value: "8px", source: "s:7" },
  { name: "--radius-md", value: "8px", source: "s:8" },
  { name: "--font-size-base", value: "14px", source: "s:9" },
];

describe("token presentation", () => {
  it("groups familiar names in the one compatibility module", () => {
    const group = (name: string) => presentationForToken({ name, value: "", source: "fixture.css:1" }).group;
    expect(group("--color-surface-raised")).toBe("color");
    expect(group("--space-1")).toBe("spacing");
    expect(group("--radius-md")).toBe("radius");
    expect(group("--font-size-base")).toBe("typography");
    expect(group("--text-sm")).toBe("typography");
    expect(group("--z-modal")).toBe("generic");
  });
});

describe("getCompatibleTokenCandidates", () => {
  function alternativeNames(property: string, currentToken: string | null): string[] {
    return getCompatibleTokenCandidates({ property, entries: ENTRIES, currentToken }).map(({ entry }) => entry.name);
  }

  it("for a background property returns only color tokens", () => {
    expect(alternativeNames("background", "--color-surface-raised")).toEqual(["--color-surface-raised", "--color-surface-sunken"]);
  });

  it("for padding returns every CSS-compatible dimension, with spacing ranked first", () => {
    expect(alternativeNames("padding", "--space-1")).toEqual(["--space-1", "--space-2", "--font-size-base", "--radius-md"]);
  });

  it("for border-radius returns every CSS-compatible dimension, with radius ranked first", () => {
    expect(alternativeNames("border-radius", null)).toEqual(["--radius-md", "--font-size-base", "--space-1", "--space-2"]);
  });

  it("keeps a cross-category current token available for the selected field", () => {
    expect(alternativeNames("border-radius", "--space-1")).toEqual(["--space-1", "--radius-md", "--font-size-base", "--space-2"]);
  });

  it("for font-size returns every CSS-compatible dimension, with typography ranked first", () => {
    expect(alternativeNames("font-size", null)).toEqual(["--font-size-base", "--radius-md", "--space-1", "--space-2"]);
  });

  it("classifies type, leading, and tracking aliases as typography", () => {
    const group = (name: string) => presentationForToken({ name, value: "", source: "fixture.css:1" }).group;
    expect(group("--type-size-body")).toBe("typography");
    expect(group("--leading-body")).toBe("typography");
    expect(group("--tracking-tight")).toBe("typography");
  });
});

describe("TokenDropdown rendering", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetPendingRules();
    document.getElementById("design-tool-styles")?.remove();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    resetPendingRules();
    document.getElementById("design-tool-styles")?.remove();
    document.body.innerHTML = "";
  });

  function makeRow(property: string, tokenName: string | null): ResolvedProperty {
    return {
      property,
      tokenName,
      declaredValue: tokenName ? `var(${tokenName})` : "pointer",
      resolvedValue: tokenName ? "#fff" : "pointer",
      confidence: tokenName ? "exact" : "unknown",
      evidence: { reason: "test fixture" },
    };
  }

  function makeButton(cid = "Button", src = "src/Button.tsx:1:1"): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.setAttribute("data-cid", cid);
    btn.setAttribute("data-src", src);
    document.body.appendChild(btn);
    return btn;
  }

  it("renders a select with the current token pre-selected when tokenName is set", () => {
    const btn = makeButton();
    act(() => {
      root.render(
        createElement(TokenDropdown, {
          row: makeRow("background", "--color-surface-raised"),
          domElement: btn,
          entries: ENTRIES,
        }),
      );
    });
    const select = host.querySelector('[data-test="token-select"]') as HTMLElement | null;
    expect(select).not.toBeNull();
    expect(select!.textContent).toContain("--color-surface-raised");
    expect(selectOptionValues(select!)).toEqual([
      "--color-surface-raised",
      "--color-surface-sunken",
    ]);
    btn.remove();
  });

  it("renders a promote select for not-a-token rows with a disabled placeholder", () => {
    const btn = makeButton();
    act(() => {
      root.render(
        createElement(TokenDropdown, {
          row: makeRow("border-radius", null),
          domElement: btn,
          entries: ENTRIES,
        }),
      );
    });
    const select = host.querySelector('[data-test="token-promote-select"]') as HTMLElement | null;
    expect(select).not.toBeNull();
    expect(select!.textContent).toContain("Replace with token");
    expect(select!.getAttribute("aria-haspopup")).toBe("listbox");
    btn.remove();
  });

  it("offers CSS-compatible dimensions in a spacing promote select", () => {
    const btn = makeButton();
    act(() => {
      root.render(
        createElement(TokenDropdown, {
          row: makeRow("padding-top", null),
          domElement: btn,
          entries: ENTRIES,
        }),
      );
    });
    const select = host.querySelector('[data-test="token-promote-select"]') as HTMLElement;
    const values = selectOptionValues(select);
    expect(values).toEqual(["--space-1", "--space-2", "--radius-md", "--font-size-base"]);
    btn.remove();
  });

  it("promotes a hardcoded value to a token via the promote select onChange", () => {
    const btn = makeButton();
    act(() => {
      root.render(
        createElement(TokenDropdown, {
          row: makeRow("border-radius", null),
          domElement: btn,
          entries: ENTRIES,
        }),
      );
    });
    const select = host.querySelector('[data-test="token-promote-select"]') as HTMLElement;
    setSelectValue(select, "--radius-md");
    const sheetText = getManagedSheetText();
    expect(sheetText).toContain('[data-cid="Button"][data-src="src/Button.tsx:1:1"]');
    expect(sheetText).toContain("border-radius: var(--radius-md);");
    btn.remove();
  });

  it("swaps a known token to an alternative via the token select onChange", () => {
    const btn = makeButton();
    act(() => {
      root.render(
        createElement(TokenDropdown, {
          row: makeRow("background", "--color-surface-raised"),
          domElement: btn,
          entries: ENTRIES,
        }),
      );
    });
    const select = host.querySelector('[data-test="token-select"]') as HTMLElement;
    setSelectValue(select, "--color-surface-sunken");
    const sheetText = getManagedSheetText();
    expect(sheetText).toContain("background: var(--color-surface-sunken);");
    btn.remove();
  });
});
