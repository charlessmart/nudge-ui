// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest";
import { createHtmlIterationCoordinator, type HtmlIterationStorage } from "./coordinator.ts";
import { activateDraftForCard, loadDrafts, resetDrafts, getDraftContentsForCard } from "../drafts/store.ts";
import { hydrateCanvasStore } from "../canvas/canvasStore.ts";
import { draftChangeStore, resetDraftChanges } from "../changes/draftChanges.ts";
import type { ElementChangeRecord } from "../changes/types.ts";
import type { HtmlArtifactRevision } from "../../transport/artifacts.ts";

const base = "a".repeat(64);
const saved = "b".repeat(64);
const external = "c".repeat(64);
const style: ElementChangeRecord = {
  cid: "Heading", file: "iteration.html", line: 1, selector: '[data-cid="Heading"]',
  property: "color", oldToken: null, newToken: null, oldRawValue: "black", rawValue: "red",
  source: { file: "iteration.html", line: 1, component: "Heading" },
};

class MemoryIterations implements HtmlIterationStorage {
  html = "Original design";
  revision: HtmlArtifactRevision = { document: base, preview: base };
  fail = false;
  beforeCommit: (() => Promise<void>) | undefined;
  beforeRead: (() => Promise<void>) | undefined;
  async readRevision(): Promise<HtmlArtifactRevision> {
    await this.beforeRead?.();
    return { ...this.revision };
  }
  async commit(_id: string, expected: HtmlArtifactRevision, html?: string): Promise<HtmlArtifactRevision> {
    await this.beforeCommit?.();
    if (this.fail) throw new Error("Storage unavailable");
    if (expected.document !== this.revision.document || expected.preview !== this.revision.preview) throw new Error("Iteration conflict");
    if (html !== undefined) { this.html = html; this.revision = { document: saved, preview: saved }; }
    else this.revision = { ...this.revision, preview: this.revision.document };
    return this.revision;
  }
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

beforeEach(() => {
  resetDrafts(); resetDraftChanges(); localStorage.clear();
  hydrateCanvasStore("canvas", [
    { id: "original", content: { kind: "route", url: window.location.href }, title: null, x: 0, y: 0, width: 100, height: 100 },
    { id: "iteration", content: { kind: "iteration", artifactId: "artifact", sourceUrl: window.location.href }, title: null, x: 0, y: 0, width: 100, height: 100 },
  ], { x: 0, y: 0, zoom: 1 });
  loadDrafts("iterations");
  activateDraftForCard("original");
  draftChangeStore.commitChangeRecords([style]);
  activateDraftForCard("iteration");
});
afterEach(() => { resetDrafts(); resetDraftChanges(); });

it("saves and settles the iteration while preserving the original draft", async () => {
  draftChangeStore.commitChangeRecords([{ ...style, rawValue: "blue" }]);
  const storage = new MemoryIterations();
  const coordinator = createHtmlIterationCoordinator(storage);

  const handedOff = await coordinator.prepare("iteration", "artifact", base, async () => "Blue design");

  expect(storage.html).toBe("Blue design");
  expect(storage.revision).toEqual({ document: saved, preview: saved });
  expect(handedOff.changes).toMatchObject([{ rawValue: "blue" }]);
  expect(getDraftContentsForCard("iteration")?.changes).toEqual([]);
  expect(getDraftContentsForCard("original")?.changes).toMatchObject([{ rawValue: "red" }]);
});

it("keeps browser intent and agent output when the loaded editing base is stale", async () => {
  draftChangeStore.commitChangeRecords([style]);
  const storage = new MemoryIterations();
  storage.html = "Agent design";
  storage.revision = { document: external, preview: base };

  await expect(createHtmlIterationCoordinator(storage).prepare("iteration", "artifact", base, async () => "Browser design")).rejects.toThrow("Iteration conflict");

  expect(storage.html).toBe("Agent design");
  expect(getDraftContentsForCard("iteration")?.changes).toMatchObject([{ rawValue: "red" }]);
  expect(draftChangeStore.getSnapshot().canUndo).toBe(true);
});

it("keeps newer edits made while the rendered document is being captured", async () => {
  draftChangeStore.commitChangeRecords([style]);
  const storage = new MemoryIterations();
  const capturing = gate();
  const finishCapture = gate();
  const pending = createHtmlIterationCoordinator(storage).prepare("iteration", "artifact", base, async () => {
    capturing.release(); await finishCapture.promise; return "Red design";
  });
  await capturing.promise;
  draftChangeStore.commitChangeRecords([{ ...style, rawValue: "purple" }]);
  finishCapture.release();

  await expect(pending).rejects.toThrow("changed while saving");
  expect(storage.html).toBe("Original design");
  expect(getDraftContentsForCard("iteration")?.changes).toMatchObject([{ rawValue: "purple" }]);
});

it("holds only the saved draft stable during file commit and releases it on failure", async () => {
  draftChangeStore.commitChangeRecords([style]);
  const storage = new MemoryIterations();
  storage.fail = true;
  let commitResult: unknown;
  storage.beforeCommit = async () => {
    commitResult = draftChangeStore.commitChangeRecords([{ ...style, rawValue: "purple" }]);
  };

  await expect(createHtmlIterationCoordinator(storage).prepare("iteration", "artifact", base, async () => "Red design")).rejects.toThrow("Storage unavailable");

  expect(commitResult).toBe("blocked");
  expect(getDraftContentsForCard("iteration")?.changes).toMatchObject([{ rawValue: "red" }]);
  expect(draftChangeStore.commitChangeRecords([{ ...style, rawValue: "green" }])).toBe("applied");
});

it("promotes external edits only when the iteration has no pending intent", async () => {
  const storage = new MemoryIterations();
  storage.html = "Agent design";
  storage.revision = { document: external, preview: base };
  const coordinator = createHtmlIterationCoordinator(storage);
  draftChangeStore.commitChangeRecords([style]);
  expect(await coordinator.refresh("iteration", "artifact", base, () => true)).toBe(false);
  expect(storage.revision.preview).toBe(base);
  draftChangeStore.clearActiveDraftChanges();
  expect(await coordinator.refresh("iteration", "artifact", base, () => true)).toBe(true);
  expect(storage.revision.preview).toBe(external);
  expect(storage.html).toBe("Agent design");
});

it("defers promotion when edits begin while checking for agent changes", async () => {
  const storage = new MemoryIterations();
  storage.revision = { document: external, preview: base };
  const reading = gate(); const finishRead = gate();
  storage.beforeRead = async () => { reading.release(); await finishRead.promise; };
  const pending = createHtmlIterationCoordinator(storage).refresh("iteration", "artifact", base, () => true);
  await reading.promise;
  draftChangeStore.commitChangeRecords([style]);
  finishRead.release();
  expect(await pending).toBe(false);
  expect(storage.revision.preview).toBe(base);
  expect(getDraftContentsForCard("iteration")?.changes).toMatchObject([{ rawValue: "red" }]);
});


it("queues external refresh behind an in-flight handoff", async () => {
  draftChangeStore.commitChangeRecords([style]);
  const storage = new MemoryIterations();
  const committing = gate();
  const finishCommit = gate();
  storage.beforeCommit = async () => { committing.release(); await finishCommit.promise; };
  const coordinator = createHtmlIterationCoordinator(storage);
  const handoff = coordinator.prepare("iteration", "artifact", base, async () => "Saved browser design");
  await committing.promise;

  // Refresh must see the settled draft and new preview, rather than skip the
  // in-flight intent and leave a frame displaying its old editing base.
  const refresh = coordinator.refresh("iteration", "artifact", base, () => true);
  finishCommit.release();
  await handoff;

  expect(await refresh).toBe(true);
  expect(storage.html).toBe("Saved browser design");
  expect(storage.revision).toEqual({ document: saved, preview: saved });
  expect(getDraftContentsForCard("iteration")?.changes).toEqual([]);
});
