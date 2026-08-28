// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  computeProjection,
  resetProjectionRevision,
  registerCardFrame,
  registerCardFrameSource,
  unregisterCardFrame,
  findCanvasFrameBySource,
  getRegisteredFrames,
  getCanvasProjectionStatus,
  projectToAllReadyCards,
  PROJECT_ID,
  recordCanvasProjectionApplied,
  sendProjectionToCard,
  WORKSPACE_ID,
} from "./projection.ts";
import { appendChange, clearChanges, getPendingRules } from "../changesLog.ts";
import type { TokenEntry } from "virtual:design-tokens";
import { createStructuralDelete, createStructuralMove, resetStructuralDeleteProjection } from "../structuralProjection.ts";

const COLOR_A: TokenEntry = { name: "--color-a", value: "#aaaaaa", source: "styles.css:1" };
const COLOR_B: TokenEntry = { name: "--color-b", value: "#bbbbbb", source: "styles.css:2" };

describe("projection", () => {
  beforeEach(() => {
    clearChanges();
    resetStructuralDeleteProjection();
    resetProjectionRevision();
    document.getElementById("nudge-ui-styles")?.remove();
    document.body.replaceChildren();
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
      context: { wrappers: [{ kind: "media", params: "(prefers-color-scheme: dark)" }] },
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

  it("increments the shared snapshot revision when structural delete intent changes", () => {
    const target = document.createElement("button");
    target.dataset.cid = "RepeatedItem";
    target.dataset.src = "src/App.tsx:12:5";
    target.textContent = "Repeated 2";
    document.body.append(target);

    const before = computeProjection();
    createStructuralDelete(target, "delete-2");
    const after = computeProjection();

    expect(before).toMatchObject({ css: "", revision: 1, structuralChanges: [] });
    expect(after.revision).toBe(2);
    expect(after.structuralChanges).toEqual([{
      id: "delete-2",
      kind: "delete",
      target: {
        sourceSite: { cid: "RepeatedItem", src: "src/App.tsx:12:5" },
        locator: {
          kind: "evidence", occurrence: 0, props: null, text: "Repeated 2", ariaLabel: null,
        },
      },
    }]);
  });

  it("increments the shared snapshot revision for a move-only structural change", () => {
    const parent = document.createElement("section");
    parent.dataset.cid = "List";
    parent.dataset.src = "src/App.tsx:5:1";
    const first = document.createElement("button");
    first.dataset.cid = "Item";
    first.dataset.src = "src/App.tsx:6:1";
    first.textContent = "One";
    const second = document.createElement("button");
    second.dataset.cid = "Item";
    second.dataset.src = "src/App.tsx:6:1";
    second.textContent = "Two";
    parent.append(first, second);
    document.body.append(parent);

    const before = computeProjection();
    createStructuralMove(second, { parent, before: first }, "move-2");
    const after = computeProjection();

    expect(after.revision).toBe(before.revision + 1);
    expect(after.css).toBe("");
    expect(after.structuralChanges).toMatchObject([{ id: "move-2", kind: "move" }]);
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

  it("tracks sent and acknowledged revisions for each frame document", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const frameWindow = iframe.contentWindow;
    if (!frameWindow || !iframe.contentDocument) throw new Error("iframe did not initialise");
    vi.spyOn(frameWindow, "postMessage").mockImplementation(() => undefined);

    registerCardFrame("card-1", iframe);
    expect(getCanvasProjectionStatus(iframe.contentDocument)).toEqual({
      sentRevision: -1,
      appliedRevision: -1,
    });

    sendProjectionToCard({
      id: "card-1",
      url: window.location.href,
      title: null,
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    }, iframe);

    expect(getCanvasProjectionStatus(iframe.contentDocument)).toEqual({
      sentRevision: 1,
      appliedRevision: -1,
    });
    recordCanvasProjectionApplied("card-1", 1);
    expect(getCanvasProjectionStatus(iframe.contentDocument)).toEqual({
      sentRevision: 1,
      appliedRevision: 1,
    });

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


  });
});
