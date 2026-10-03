// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest";
import { createHtmlStudyCoordinator, type HtmlStudyStorage } from "./study.ts";
import { activateDraftForCard, initializeDrafts, resetDrafts, getWorkspaceForCard, createStudyDraft } from "../drafts/store.ts";
import { workspaceChangeStore, resetWorkspaceChanges } from "../changes/workspaceChanges.ts";
import type { ElementChangeRecord } from "../changes/types.ts";
import type { HtmlArtifactRevision } from "../../transport/artifacts.ts";

const base = "a".repeat(64);
const saved = "b".repeat(64);
const external = "c".repeat(64);
const style: ElementChangeRecord = {
  cid: "Heading", file: "study.html", line: 1, selector: '[data-cid="Heading"]',
  property: "color", oldToken: null, newToken: null, oldRawValue: "black", rawValue: "red",
  source: { file: "study.html", line: 1, component: "Heading" },
};

class MemoryStudies implements HtmlStudyStorage {
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
    if (expected.document !== this.revision.document || expected.preview !== this.revision.preview) throw new Error("Study conflict");
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
  resetDrafts(); resetWorkspaceChanges(); localStorage.clear();
  initializeDrafts("studies", ["original", "study"]);
  activateDraftForCard("original");
  workspaceChangeStore.commitChangeRecords([style]);
  createStudyDraft("original", "study", "artifact");
  activateDraftForCard("study");
});
afterEach(() => { resetDrafts(); resetWorkspaceChanges(); });

it("saves and settles the study while preserving the original draft", async () => {
  workspaceChangeStore.commitChangeRecords([{ ...style, rawValue: "blue" }]);
  const storage = new MemoryStudies();
  const coordinator = createHtmlStudyCoordinator(storage);

  const handedOff = await coordinator.prepare("study", "artifact", base, async () => "Blue design");

  expect(storage.html).toBe("Blue design");
  expect(storage.revision).toEqual({ document: saved, preview: saved });
  expect(handedOff.changes).toMatchObject([{ rawValue: "blue" }]);
  expect(getWorkspaceForCard("study")?.changes).toEqual([]);
  expect(getWorkspaceForCard("original")?.changes).toMatchObject([{ rawValue: "red" }]);
});

it("keeps browser intent and agent output when the loaded editing base is stale", async () => {
  workspaceChangeStore.commitChangeRecords([style]);
  const storage = new MemoryStudies();
  storage.html = "Agent design";
  storage.revision = { document: external, preview: base };

  await expect(createHtmlStudyCoordinator(storage).prepare("study", "artifact", base, async () => "Browser design")).rejects.toThrow("Study conflict");

  expect(storage.html).toBe("Agent design");
  expect(getWorkspaceForCard("study")?.changes).toMatchObject([{ rawValue: "red" }]);
  expect(workspaceChangeStore.getSnapshot().canUndo).toBe(true);
});

it("keeps newer edits made while the rendered document is being captured", async () => {
  workspaceChangeStore.commitChangeRecords([style]);
  const storage = new MemoryStudies();
  const capturing = gate();
  const finishCapture = gate();
  const pending = createHtmlStudyCoordinator(storage).prepare("study", "artifact", base, async () => {
    capturing.release(); await finishCapture.promise; return "Red design";
  });
  await capturing.promise;
  workspaceChangeStore.commitChangeRecords([{ ...style, rawValue: "purple" }]);
  finishCapture.release();

  await expect(pending).rejects.toThrow("changed while saving");
  expect(storage.html).toBe("Original design");
  expect(getWorkspaceForCard("study")?.changes).toMatchObject([{ rawValue: "purple" }]);
});

it("holds only the saved draft stable during file commit and releases it on failure", async () => {
  workspaceChangeStore.commitChangeRecords([style]);
  const storage = new MemoryStudies();
  storage.fail = true;
  let commitResult: unknown;
  storage.beforeCommit = async () => {
    commitResult = workspaceChangeStore.commitChangeRecords([{ ...style, rawValue: "purple" }]);
  };

  await expect(createHtmlStudyCoordinator(storage).prepare("study", "artifact", base, async () => "Red design")).rejects.toThrow("Storage unavailable");

  expect(commitResult).toBe("blocked");
  expect(getWorkspaceForCard("study")?.changes).toMatchObject([{ rawValue: "red" }]);
  expect(workspaceChangeStore.commitChangeRecords([{ ...style, rawValue: "green" }])).toBe("applied");
});

it("promotes external edits only when the study has no pending intent", async () => {
  const storage = new MemoryStudies();
  storage.html = "Agent design";
  storage.revision = { document: external, preview: base };
  const coordinator = createHtmlStudyCoordinator(storage);
  workspaceChangeStore.commitChangeRecords([style]);
  expect(await coordinator.refresh("study", "artifact", base, () => true)).toBe(false);
  expect(storage.revision.preview).toBe(base);
  workspaceChangeStore.clearWorkspaceChanges();
  expect(await coordinator.refresh("study", "artifact", base, () => true)).toBe(true);
  expect(storage.revision.preview).toBe(external);
  expect(storage.html).toBe("Agent design");
});

it("defers promotion when edits begin while checking for agent changes", async () => {
  const storage = new MemoryStudies();
  storage.revision = { document: external, preview: base };
  const reading = gate(); const finishRead = gate();
  storage.beforeRead = async () => { reading.release(); await finishRead.promise; };
  const pending = createHtmlStudyCoordinator(storage).refresh("study", "artifact", base, () => true);
  await reading.promise;
  workspaceChangeStore.commitChangeRecords([style]);
  finishRead.release();
  expect(await pending).toBe(false);
  expect(storage.revision.preview).toBe(base);
  expect(getWorkspaceForCard("study")?.changes).toMatchObject([{ rawValue: "red" }]);
});


it("queues external refresh behind an in-flight handoff", async () => {
  workspaceChangeStore.commitChangeRecords([style]);
  const storage = new MemoryStudies();
  const committing = gate();
  const finishCommit = gate();
  storage.beforeCommit = async () => { committing.release(); await finishCommit.promise; };
  const coordinator = createHtmlStudyCoordinator(storage);
  const handoff = coordinator.prepare("study", "artifact", base, async () => "Saved browser design");
  await committing.promise;

  // Refresh must see the settled draft and new preview, rather than skip the
  // in-flight intent and leave a frame displaying its old editing base.
  const refresh = coordinator.refresh("study", "artifact", base, () => true);
  finishCommit.release();
  await handoff;

  expect(await refresh).toBe(true);
  expect(storage.html).toBe("Saved browser design");
  expect(storage.revision).toEqual({ document: saved, preview: saved });
  expect(getWorkspaceForCard("study")?.changes).toEqual([]);
});
