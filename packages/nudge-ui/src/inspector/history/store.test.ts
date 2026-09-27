// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadWorkspaceChanges } from "../changes/changesLog.ts";
import type { ElementChangeRecord } from "../changes/types.ts";
import {
  activateDraftForCard,
  completeHandoffHistory,
  forkDraftForCard,
  getFrameContent,
  getVersionHistorySnapshot,
  getWorkspaceForCard,
  initializeVersionHistory,
  prepareHandoffHistory,
  registerHistoryFrameLookup,
  removeCardHistory,
  resetVersionHistory,
  saveManualCheckpoint,
} from "./store.ts";
import { captureViewport } from "../sketch/capture.ts";

vi.mock("../sketch/capture.ts", () => ({ captureViewport: vi.fn() }));

function testFrames(): Map<string, HTMLIFrameElement> {
  return (globalThis as unknown as { __historyTestFrames: Map<string, HTMLIFrameElement> }).__historyTestFrames;
}

function change(rawValue: string): ElementChangeRecord {
  return {
    cid: "Heading",
    file: "src/Heading.tsx",
    line: 2,
    selector: '[data-cid="Heading"]',
    property: "color",
    oldToken: null,
    newToken: null,
    oldRawValue: "black",
    rawValue,
    source: { file: "src/Heading.tsx", line: 2, component: "Heading" },
  };
}

beforeEach(() => {
  localStorage.clear();
  resetVersionHistory();
  loadWorkspaceChanges([change("red")], []);
  const frames = new Map<string, HTMLIFrameElement>();
  registerHistoryFrameLookup(() => frames);
  (globalThis as unknown as { __historyTestFrames?: Map<string, HTMLIFrameElement> }).__historyTestFrames = frames;
  vi.mocked(captureViewport).mockResolvedValue({
    originalImage: new Blob(["png"], { type: "image/png" }),
    imageWidth: 800,
    imageHeight: 600,
    capture: {
      url: "http://localhost/page",
      title: "Page",
      timestamp: 1,
      viewportWidth: 800,
      viewportHeight: 600,
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
      host: "vite",
      framework: "react",
      imageWidth: 800,
      imageHeight: 600,
    },
  });
});

describe("version history drafts", () => {
  it("forks a duplicated card and keeps subsequent edits independent", () => {
    initializeVersionHistory("project", ["original"]);
    activateDraftForCard("original");
    expect(forkDraftForCard("original", "duplicate")).not.toBeNull();

    activateDraftForCard("duplicate");
    loadWorkspaceChanges([change("blue")], []);

    expect(getWorkspaceForCard("original")?.changes[0]).toMatchObject({ rawValue: "red" });
    expect(getWorkspaceForCard("duplicate")?.changes[0]).toMatchObject({ rawValue: "blue" });
  });

  it("reads the live workspace for the active draft", () => {
    initializeVersionHistory("project", ["original"]);
    activateDraftForCard("original");
    loadWorkspaceChanges([change("green")], []);
    expect(getWorkspaceForCard("original")?.changes[0]).toMatchObject({ rawValue: "green" });
  });

  it("drops per-card associations without deleting drafts", () => {
    initializeVersionHistory("project", ["original"]);
    activateDraftForCard("original");
    forkDraftForCard("original", "duplicate");
    removeCardHistory("duplicate");
    expect(getWorkspaceForCard("duplicate")).toBeNull();
    expect(getFrameContent("duplicate")).toBeNull();
    expect(getVersionHistorySnapshot().drafts).toHaveLength(2);
  });

  it("saves a manual checkpoint for the active draft", async () => {
    initializeVersionHistory("project", ["original"]);
    activateDraftForCard("original");
    const frame = document.createElement("iframe");
    document.body.append(frame);
    testFrames().set("original", frame);

    const result = await saveManualCheckpoint("original");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.origin).toEqual({ kind: "manual" });
      expect(result.value.contents.changes[0]).toMatchObject({ rawValue: "red" });
    }
    frame.remove();
  });

  it("saves proposal and comparison captures before freezing the original", async () => {
    initializeVersionHistory("project", ["original"]);
    forkDraftForCard("original", "duplicate");
    activateDraftForCard("duplicate");

    const originalFrame = document.createElement("iframe");
    const duplicateFrame = document.createElement("iframe");
    document.body.append(originalFrame, duplicateFrame);
    testFrames().set("original", originalFrame);
    testFrames().set("duplicate", duplicateFrame);

    const result = await prepareHandoffHistory({
      activeCardId: "duplicate",
      prompt: "Apply the blue heading.",
      transport: "clipboard",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getVersionHistorySnapshot().checkpoints.map((checkpoint) => checkpoint.label))
      .toEqual(["Proposed changes", "Before"]);
    expect(getFrameContent("original")?.kind).toBe("live");

    completeHandoffHistory(result.value.id);
    expect(getFrameContent("original")?.kind).toBe("snapshot");

    originalFrame.remove();
    duplicateFrame.remove();
  });
});

afterEach(() => {
  registerHistoryFrameLookup(null);
});
