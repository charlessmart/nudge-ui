// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { classifyToken, getAlternativeTokens, TokenDropdown } from "./TokenDropdown.tsx";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "./resolution.ts";
import { resetPendingRules } from "./editActions.ts";
import { selectOptionValues, setSelectValue } from "../styleEditors/_testUtils.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ENTRIES: TokenEntry[] = [
  { name: "--color-surface-raised", value: "#ffffff", source: "s:1" },
  { name: "--color-surface-sunken", value: "#f5f5f5", source: "s:2" },
  { name: "--space-1", value: "4px", source: "s:6" },
  { name: "--space-2", value: "8px", source: "s:7" },
  { name: "--radius-md", value: "8px", source: "s:8" },
  { name: "--font-size-base", value: "14px", source: "s:9" },
];

describe("classifyToken", () => {
  it("groups by name prefix", () => {
    expect(classifyToken("--color-surface-raised")).toBe("color");
    expect(classifyToken("--space-1")).toBe("spacing");
    expect(classifyToken("--radius-md")).toBe("radius");
    expect(classifyToken("--font-size-base")).toBe("typography");
    expect(classifyToken("--text-sm")).toBe("typography");
    expect(classifyToken("--z-modal")).toBe("generic");
  });
});

describe("getAlternativeTokens", () => {
  it("for a background property returns only color tokens", () => {
    const result = getAlternativeTokens(ENTRIES, { property: "background", currentToken: "--color-surface-raised" });
    expect(result.map((e) => e.name)).toEqual(["--color-surface-raised", "--color-surface-sunken"]);
  });

  it("for padding returns only spacing tokens", () => {
    const result = getAlternativeTokens(ENTRIES, { property: "padding", currentToken: "--space-1" });
    expect(result.map((e) => e.name)).toEqual(["--space-1", "--space-2"]);
  });

  it("for border-radius returns only radius tokens", () => {
    const result = getAlternativeTokens(ENTRIES, { property: "border-radius", currentToken: null });
    expect(result.map((e) => e.name)).toEqual(["--radius-md"]);
  });

  it("keeps a cross-category current token available for the selected field", () => {
    const result = getAlternativeTokens(ENTRIES, { property: "border-radius", currentToken: "--space-1" });
    expect(result.map((e) => e.name)).toEqual(["--space-1", "--radius-md"]);
  });

  it("for font-size returns only typography tokens", () => {
    const result = getAlternativeTokens(ENTRIES, { property: "font-size", currentToken: null });
    expect(result.map((e) => e.name)).toEqual(["--font-size-base"]);
  });

  it("classifies type, leading, and tracking aliases as typography", () => {
    expect(classifyToken("--type-size-body")).toBe("typography");
    expect(classifyToken("--leading-body")).toBe("typography");
    expect(classifyToken("--tracking-tight")).toBe("typography");
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

  it("limits a spacing promote select to spacing tokens", () => {
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
    expect(values).toEqual(["--space-1", "--space-2"]);
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
    const sheet = document.getElementById("design-tool-styles") as HTMLStyleElement;
    expect(sheet.textContent).toContain('[data-cid="Button"][data-src="src/Button.tsx:1:1"]');
    expect(sheet.textContent).toContain("border-radius: var(--radius-md);");
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
    const sheet = document.getElementById("design-tool-styles") as HTMLStyleElement;
    expect(sheet.textContent).toContain("background: var(--color-surface-sunken);");
    btn.remove();
  });
});
