// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  computeProjection,
  resetProjectionRevision,
  registerCardFrame,
  registerCardFrameSource,
  unregisterCardFrame,
  findCanvasFrameBySource,
  getRegisteredFrames,
  projectToAllReadyCards,
  PROJECT_ID,
  WORKSPACE_ID,
} from "./projection.ts";
import { appendChange, clearChanges, getPendingRules } from "../changesLog.ts";
import type { TokenEntry } from "virtual:design-tokens";

const COLOR_A: TokenEntry = { name: "--color-a", value: "#aaaaaa", source: "styles.css:1" };
const COLOR_B: TokenEntry = { name: "--color-b", value: "#bbbbbb", source: "styles.css:2" };

describe("projection", () => {
  beforeEach(() => {
    clearChanges();
    resetProjectionRevision();
    document.getElementById("design-tool-styles")?.remove();
  });

  it("computeProjection returns CSS from pending rules", () => {
    appendChange({
      cid: "Button",
      file: "src/Button.tsx",
      line: 1,
      selector: '[data-cid="Button"][data-src*="src/Button.tsx:1"]',
      property: "background",
      oldToken: COLOR_A,
      newToken: COLOR_B,
      source: { file: "src/Button.tsx", line: 1, component: "Button" },
    });

    const { css, revision } = computeProjection();
    expect(css).toContain("background: var(--color-b);");
    expect(revision).toBe(1);
  });

  it("computeProjection returns stable revision when CSS is unchanged", () => {
    appendChange({
      cid: "Button",
      file: "src/Button.tsx",
      line: 1,
      selector: '[data-cid="Button"][data-src*="src/Button.tsx:1"]',
      property: "background",
      oldToken: COLOR_A,
      newToken: COLOR_B,
      source: { file: "src/Button.tsx", line: 1, component: "Button" },
    });

    const r1 = computeProjection();
    const r2 = computeProjection();
    const r3 = computeProjection();
    expect(r1.revision).toBe(1);
    expect(r2.revision).toBe(1);
    expect(r3.revision).toBe(1);
  });

  it("computeProjection increments revision when CSS changes", () => {
    const r1 = computeProjection();
    expect(r1.revision).toBe(1);

    appendChange({
      cid: "Button",
      file: "src/Button.tsx",
      line: 1,
      selector: '[data-cid="Button"][data-src*="src/Button.tsx:1"]',
      property: "background",
      oldToken: COLOR_A,
      newToken: COLOR_B,
      source: { file: "src/Button.tsx", line: 1, component: "Button" },
    });

    const r2 = computeProjection();
    expect(r2.revision).toBe(2);
  });

  it("computeProjection returns empty CSS when no changes exist", () => {
    const { css, revision } = computeProjection();
    expect(css).toBe("");
    expect(revision).toBe(1);
  });

  it("computeProjection serializes token changes with media context", () => {
    appendChange({
      kind: "token",
      tokenName: "--color-text",
      file: "src/theme.css",
      line: 6,
      selector: ':root[data-theme="dark"]',
      property: "--color-text",
      rawValue: "#eeeeee",
      oldRawValue: "#dddddd",
      context: { media: "(prefers-color-scheme: dark)" },
      contextLabel: 'root[data-theme="dark"]',
      source: { file: "src/theme.css", line: 6, component: "Global token" },
    });

    const { css } = computeProjection();
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain("--color-text: #eeeeee");
  });

  it("clearChanges produces empty projection", () => {
    appendChange({
      cid: "Button",
      file: "src/Button.tsx",
      line: 1,
      selector: '[data-cid="Button"]',
      property: "color",
      oldToken: null,
      newToken: null,
      rawValue: "red",
      source: { file: "src/Button.tsx", line: 1, component: "Button" },
    });

    expect(computeProjection().css).not.toBe("");

    clearChanges();
    expect(computeProjection().css).toBe("");
  });

  it("revision never decreases", () => {
    appendChange({
      cid: "Button",
      file: "src/Button.tsx",
      line: 1,
      selector: '[data-cid="Button"][data-src*="src/Button.tsx:1"]',
      property: "background",
      oldToken: COLOR_A,
      newToken: COLOR_B,
      source: { file: "src/Button.tsx", line: 1, component: "Button" },
    });

    expect(computeProjection().revision).toBe(1);
    clearChanges();
    expect(computeProjection().revision).toBe(2);
    expect(computeProjection().revision).toBe(2);
  });

  it("PROJECT_ID is derived from window.location.origin", () => {
    expect(PROJECT_ID).toBe(window.location.origin);
  });

  it("WORKSPACE_ID is a non-empty string", () => {
    expect(typeof WORKSPACE_ID).toBe("string");
    expect(WORKSPACE_ID.length).toBeGreaterThan(0);
  });

  it("frame registry tracks registered iframes", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    registerCardFrameSource("card-1", iframe);
    expect(findCanvasFrameBySource(iframe.contentWindow)).toEqual({
      cardId: "card-1",
      iframe,
    });
    expect(getRegisteredFrames().has("card-1")).toBe(false);
    registerCardFrame("card-1", iframe);
    expect(getRegisteredFrames().has("card-1")).toBe(true);
    expect(findCanvasFrameBySource(window)).toBeNull();
    unregisterCardFrame("card-1");
  });

  describe("revision ordering", () => {
    it("revision changes only when CSS changes", () => {
      const r1 = computeProjection().revision;

      appendChange({
        cid: "Button",
        file: "src/Button.tsx",
        line: 1,
        selector: '[data-cid="Button"][data-src*="src/Button.tsx:1"]',
        property: "background",
        oldToken: null,
        newToken: null,
        rawValue: "blue",
        source: { file: "src/Button.tsx", line: 1, component: "Button" },
      });

      const r2 = computeProjection().revision;
      expect(r2).toBeGreaterThan(r1);
    });

    it("revision-only: a newer revision with same CSS is accepted", () => {
      appendChange({
        cid: "Button",
        file: "src/Button.tsx",
        line: 1,
        selector: '[data-cid="Button"][data-src*="src/Button.tsx:1"]',
        property: "background",
        oldToken: null,
        newToken: null,
        rawValue: "blue",
        source: { file: "src/Button.tsx", line: 1, component: "Button" },
      });

      const { revision } = computeProjection();
      expect(revision).toBeGreaterThan(0);
    });
  });
});
