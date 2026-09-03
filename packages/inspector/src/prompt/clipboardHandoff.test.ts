// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendChange, clearChanges, getChangesList, type ElementChangeRecord } from "../changesLog.ts";
import { setNudgeUiHostDevFlag } from "../devFlag.ts";
import {
  clearClipboardHandoff,
  getClipboardHandoffSnapshot,
  getLastClipboardReconciledCount,
  hydrateClipboardHandoff,
  isClipboardHandoffSnapshot,
  recordClipboardHandoff,
  startClipboardHandoffController,
} from "./clipboardHandoff.ts";

function styleChange(rawValue = "rgb(255, 0, 0)"): ElementChangeRecord {
  return {
    cid: "Card",
    file: "src/Card.tsx",
    line: 4,
    selector: '[data-cid="Card"]',
    property: "color",
    oldToken: null,
    newToken: null,
    oldRawValue: "rgb(0, 0, 0)",
    rawValue,
    source: { file: "src/Card.tsx", line: 4, component: "Card" },
  };
}

describe("clipboard prompt handoff", () => {
  beforeEach(() => {
    setNudgeUiHostDevFlag(true);
    clearChanges();
    clearClipboardHandoff();
    document.head.replaceChildren();
    const card = document.createElement("div");
    card.dataset.cid = "Card";
    document.body.replaceChildren(card);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    clearClipboardHandoff();
    clearChanges();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("automatically removes a copied change after source-rendered output matches", async () => {
    vi.useFakeTimers();
    const stop = startClipboardHandoffController();
    appendChange(styleChange());
    recordClipboardHandoff(getChangesList());

    const authored = document.createElement("style");
    authored.textContent = '[data-cid="Card"] { color: rgb(255, 0, 0); }';
    document.head.prepend(authored);
    window.dispatchEvent(new Event("focus"));

    await vi.advanceTimersByTimeAsync(500);

    expect(getChangesList()).toEqual([]);
    expect(getClipboardHandoffSnapshot()).toBeNull();
    expect(getLastClipboardReconciledCount()).toBe(1);
    stop();
  });

  it("preserves a newer inspector value at the same change key", async () => {
    vi.useFakeTimers();
    const stop = startClipboardHandoffController();
    appendChange(styleChange());
    recordClipboardHandoff(getChangesList());
    appendChange(styleChange("rgb(0, 0, 255)"));

    const authored = document.createElement("style");
    authored.textContent = '[data-cid="Card"] { color: rgb(255, 0, 0); }';
    document.head.prepend(authored);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(500);

    expect(getChangesList()).toMatchObject([{ rawValue: "rgb(0, 0, 255)" }]);
    expect(getClipboardHandoffSnapshot()).toBeNull();
    expect(getLastClipboardReconciledCount()).toBe(0);
    stop();
  });

  it("round-trips a validated checkpoint independently of transient preview metadata", () => {
    appendChange(styleChange());
    recordClipboardHandoff(getChangesList());
    const snapshot = getClipboardHandoffSnapshot();
    expect(isClipboardHandoffSnapshot(snapshot)).toBe(true);

    clearClipboardHandoff();
    hydrateClipboardHandoff(snapshot!);

    expect(getClipboardHandoffSnapshot()).toEqual(snapshot);
    expect(isClipboardHandoffSnapshot({
      changes: [{ key: "duplicate", fingerprint: "one" }, { key: "duplicate", fingerprint: "two" }],
      structuralChanges: [],
    })).toBe(false);
  });
});
