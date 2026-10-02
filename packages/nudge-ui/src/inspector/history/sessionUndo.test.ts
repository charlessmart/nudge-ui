// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activateIframeWorkspace, addCanvasVariation, duplicateCard, getCanvasCards, getSelectedCardId, hydrateCanvasStore, selectCard } from "../canvas/canvasStore.ts";
import { workspaceChangeStore, getWorkspaceChanges, resetWorkspaceChanges, clearSessionUndoHistory } from "../changes/workspaceChanges.ts";
import type { ElementChangeRecord, TextContentChangeRecord } from "../changes/types.ts";
import type { StructuralMove } from "../changes/structuralTypes.ts";
import { activateDraftForCard, forkDraftForCard, getWorkspaceForCard, initializeVersionHistory, linkLiveCard, resetVersionHistory, clearCommittedArtifactDraft, getVersionHistorySnapshot } from "./store.ts";

const style: ElementChangeRecord = {
  cid: "Heading", file: "study.html", line: 1, selector: '[data-cid="Heading"]',
  property: "color", oldToken: null, newToken: null, oldRawValue: "black", rawValue: "red",
  source: { file: "study.html", line: 1, component: "Heading" },
};
const text: TextContentChangeRecord = {
  kind: "text-content", id: "heading-text", selector: '[data-cid="Heading"]',
  target: { sourceSite: { cid: "Heading", src: "study.html:1:1" }, occurrence: 0, props: null, ariaLabel: null, beforeText: "Before" },
  source: { file: "study.html", line: 1, column: 1, component: "Heading" },
  before: "Before", after: "After", authoredAs: "literal",
};
const move: StructuralMove = {
  kind: "move", id: "move-heading",
  target: { sourceSite: { cid: "Heading", src: "study.html:1:1" }, locator: { kind: "evidence", occurrence: 0, props: null, text: "Before" } },
  source: { parent: { sourceSite: { cid: "Parent", src: "study.html:2:1" }, locator: { kind: "evidence", occurrence: 0, props: null, text: "" } } },
  destination: { parent: { sourceSite: { cid: "Parent", src: "study.html:2:1" }, locator: { kind: "evidence", occurrence: 0, props: null, text: "" } }, before: null },
  presentation: { sourceParentTag: "section", destinationParentTag: "section", fromIndex: 0, toIndex: 1 },
};

beforeEach(() => {
  resetVersionHistory();
  resetWorkspaceChanges();
  hydrateCanvasStore("canvas", [], { x: 0, y: 0, zoom: 1 });
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => { resetVersionHistory(); resetWorkspaceChanges(); vi.unstubAllGlobals(); });

function original() {
  const card = activateIframeWorkspace(window.location.href, { width: 800, height: 600 })!;
  initializeVersionHistory("session-test", [card.id]);
  activateDraftForCard(card.id);
  return card;
}

it("undoes text, DOM movement, and variation creation in order, then redoes the same frame and draft", () => {
  const source = original();
  workspaceChangeStore.commitChangeRecords([style]);
  const variation = addCanvasVariation(source.id, "artifact-1")!;
  forkDraftForCard(source.id, variation.id, true);
  selectCard(variation.id);
  activateDraftForCard(variation.id);
  workspaceChangeStore.commitStructuralChange(move);
  workspaceChangeStore.commitChangeRecords([text]);
  selectCard(source.id);
  activateDraftForCard(source.id);

  expect(workspaceChangeStore.undoWorkspaceChange()).toBe(true);
  expect(getSelectedCardId()).toBe(variation.id);
  expect(getWorkspaceChanges()).toMatchObject({ changes: [], structuralChanges: [move] });
  expect(getWorkspaceForCard(source.id)?.changes).toMatchObject([style]);
  workspaceChangeStore.undoWorkspaceChange();
  expect(getWorkspaceChanges().structuralChanges).toEqual([]);
  workspaceChangeStore.undoWorkspaceChange();
  expect(getCanvasCards().map((card) => card.id)).toEqual([source.id]);
  expect(getWorkspaceChanges().changes).toMatchObject([style]);
  expect(fetch).not.toHaveBeenCalled();

  workspaceChangeStore.redoWorkspaceChange();
  expect(getCanvasCards().find((card) => card.id === variation.id)?.artifactId).toBe("artifact-1");
  expect(getSelectedCardId()).toBe(variation.id);
  workspaceChangeStore.redoWorkspaceChange();
  workspaceChangeStore.redoWorkspaceChange();
  expect(getWorkspaceChanges()).toMatchObject({ changes: [text], structuralChanges: [move] });
});

it("restores linked placement and releases an undone artifact when new edits discard redo", () => {
  const source = original();
  const linked = duplicateCard(source.id)!;
  linkLiveCard(source.id, linked.id);
  workspaceChangeStore.undoWorkspaceChange();
  expect(getCanvasCards()).toHaveLength(1);
  expect(getCanvasCards()[0]?.linkedGroupId).toBeUndefined();
  workspaceChangeStore.redoWorkspaceChange();
  expect(getCanvasCards()[1]?.id).toBe(linked.id);
  expect(getCanvasCards()[0]?.linkedGroupId).toBe(linked.linkedGroupId);
  const variation = addCanvasVariation(linked.id, "artifact-2")!;
  forkDraftForCard(linked.id, variation.id, true);
  workspaceChangeStore.undoWorkspaceChange();
  expect(fetch).not.toHaveBeenCalled();
  workspaceChangeStore.commitChangeRecords([style]);
  expect(fetch).toHaveBeenCalledWith("/__nudge_ui__/artifacts/artifact-2", { method: "DELETE", keepalive: true });
  expect(getWorkspaceChanges().canRedo).toBe(false);
});

it("clears only the active draft's edit steps and keeps canvas creation undoable", () => {
  const source = original();
  const variation = addCanvasVariation(source.id, "artifact-3")!;
  forkDraftForCard(source.id, variation.id, true);
  activateDraftForCard(variation.id);
  workspaceChangeStore.commitChangeRecords([text]);
  workspaceChangeStore.clearWorkspaceChanges();
  expect(workspaceChangeStore.undoWorkspaceChange()).toBe(true);
  expect(getCanvasCards()).toHaveLength(1);
  clearSessionUndoHistory();
  expect(getWorkspaceChanges().canRedo).toBe(false);
});

it("committing a study clears its stored intent without clearing frame creation history", () => {
  const source = original();
  const variation = addCanvasVariation(source.id, "artifact-4")!;
  const draft = forkDraftForCard(source.id, variation.id, true)!;
  activateDraftForCard(variation.id);
  workspaceChangeStore.commitChangeRecords([text]);
  clearCommittedArtifactDraft(variation.id);
  expect(getVersionHistorySnapshot().drafts.find((item) => item.id === draft.id)?.contents.changes).toEqual([]);
  expect(getWorkspaceChanges().changes).toEqual([]);
  workspaceChangeStore.undoWorkspaceChange();
  expect(getCanvasCards()).toHaveLength(1);
});

it("releases detached studies when the page exits, but preserves them in the back-forward cache", () => {
  const source = original();
  const variation = addCanvasVariation(source.id, "artifact-exit")!;
  forkDraftForCard(source.id, variation.id, true);
  workspaceChangeStore.undoWorkspaceChange();
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
  expect(fetch).not.toHaveBeenCalled();
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  expect(fetch).toHaveBeenCalledWith("/__nudge_ui__/artifacts/artifact-exit", { method: "DELETE", keepalive: true });
});
