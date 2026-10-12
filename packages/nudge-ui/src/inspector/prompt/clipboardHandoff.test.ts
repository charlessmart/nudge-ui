// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateDraft,
  appendChange,
  clearActiveDraft,
  getActiveDraftChanges,
  getChangesList,
} from "../drafts/store.ts";
import type { ElementChangeRecord } from "../changes/types.ts";
import { setNudgeUiHostDevFlag } from "../runtime/devFlag.ts";
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
    clearActiveDraft();
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
    clearActiveDraft();
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
    const draftId = getActiveDraftChanges().draftId;
    activateDraft("other-page");
    expect(getLastClipboardReconciledCount()).toBe(0);
    activateDraft(draftId);
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

  it("backs off checks that find nothing while the page keeps changing", async () => {
    vi.useFakeTimers();
    let paints = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      paints += 1;
      callback(0);
      return 1;
    });
    const stop = startClipboardHandoffController();
    appendChange(styleChange());
    recordClipboardHandoff(getChangesList());
    // Each check waits two paints with the copied preview removed.
    const checks = () => paints / 2;

    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(500);
    expect(checks()).toBe(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(checks(), "A check's own preview restore must not schedule another check").toBe(1);

    // A clock-like page mutation every 500ms re-arms the check each time.
    const clock = document.createElement("time");
    document.body.append(clock);
    for (let tick = 0; tick < 10; tick += 1) {
      clock.textContent = String(tick);
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(checks()).toBeLessThanOrEqual(4);

    window.dispatchEvent(new Event("focus"));
    const before = checks();
    await vi.advanceTimersByTimeAsync(500);
    expect(checks(), "Returning to the page resets the delay").toBe(before + 1);
    expect(getChangesList()).toHaveLength(1);
    stop();
  });

  it("still verifies on a page that changes faster than the check delay", async () => {
    vi.useFakeTimers();
    const stop = startClipboardHandoffController();
    appendChange(styleChange());
    recordClipboardHandoff(getChangesList());
    const clock = document.createElement("time");
    document.body.append(clock);
    const tick = async (count: number) => {
      for (let index = 0; index < count; index += 1) {
        clock.textContent = String(index);
        await vi.advanceTimersByTimeAsync(200);
      }
    };
    // Unmatched checks back the interval off towards its 8s ceiling.
    await tick(100);
    expect(getChangesList()).toHaveLength(1);

    const authored = document.createElement("style");
    authored.textContent = '[data-cid="Card"] { color: rgb(255, 0, 0); }';
    document.head.prepend(authored);
    await tick(45);

    expect(getChangesList(), "Continuous mutations must not postpone verification indefinitely").toEqual([]);
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
