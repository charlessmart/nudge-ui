import { startWorkspaceController } from "../workspace/controller.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { studyArtifactId } from "../canvas/frameContent.ts";
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activateIframeWorkspace, addCanvasVariation, duplicateCard, getCanvasCards, getSelectedCardId, hydrateCanvasStore, selectCard, moveLinkedGroup } from "../canvas/canvasStore.ts";
import { workspaceChangeStore, getWorkspaceChanges, resetWorkspaceChanges, clearSessionUndoHistory } from "../changes/workspaceChanges.ts";
import type { ElementChangeRecord, TextContentChangeRecord } from "../changes/types.ts";
import type { StructuralMove } from "../changes/structuralTypes.ts";
import { activateDraftForCard, createStudyDraft, getWorkspaceForCard, initializeDrafts, attachDraftToCard, resetDrafts, clearCommittedArtifactDraft, getDraftsSnapshot } from "../drafts/store.ts";

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

let controller: ReturnType<typeof startWorkspaceController>;
const runtime = getNudgeUiRuntimeConfig();
beforeEach(() => {
  configureNudgeUiRuntime({ ...runtime, projectId: "session-test", demo: true });
  resetDrafts();
  resetWorkspaceChanges();
  hydrateCanvasStore("canvas", [], { x: 0, y: 0, zoom: 1 });
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  controller = startWorkspaceController();
});
afterEach(() => { controller.dispose(); configureNudgeUiRuntime(runtime); resetDrafts(); resetWorkspaceChanges(); vi.unstubAllGlobals(); });

function original() {
  const card = activateIframeWorkspace(window.location.href, { width: 800, height: 600 })!;
  initializeDrafts("session-test", [card.id]);
  activateDraftForCard(card.id);
  return card;
}

it("undoes text, DOM movement, and variation creation in order, then redoes the same frame and draft", () => {
  const source = original();
  workspaceChangeStore.commitChangeRecords([style]);
  const variation = addCanvasVariation(source.id, "artifact-1")!;
  createStudyDraft(source.id, variation.id, studyArtifactId(getCanvasCards().find((card) => card.id === variation.id)?.content)!);
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
  expect(studyArtifactId(getCanvasCards().find((card) => card.id === variation.id)?.content)).toBe("artifact-1");
  expect(getSelectedCardId()).toBe(variation.id);
  workspaceChangeStore.redoWorkspaceChange();
  workspaceChangeStore.redoWorkspaceChange();
  expect(getWorkspaceChanges()).toMatchObject({ changes: [text], structuralChanges: [move] });
});

it("restores linked placement and releases an undone artifact when new edits discard redo", () => {
  const source = original();
  const linked = duplicateCard(source.id)!;
  attachDraftToCard(linked.id, { kind: "application" });
  workspaceChangeStore.undoWorkspaceChange();
  expect(getCanvasCards()).toHaveLength(1);
  expect(getCanvasCards()[0]?.groupId).toBeUndefined();
  workspaceChangeStore.redoWorkspaceChange();
  expect(getCanvasCards()[1]?.id).toBe(linked.id);
  expect(getCanvasCards()[0]?.groupId).toBe(linked.groupId);
  const variation = addCanvasVariation(linked.id, "artifact-2")!;
  createStudyDraft(linked.id, variation.id, studyArtifactId(getCanvasCards().find((card) => card.id === variation.id)?.content)!);
  workspaceChangeStore.undoWorkspaceChange();
  expect(fetch).not.toHaveBeenCalled();
  workspaceChangeStore.commitChangeRecords([style]);
  expect(fetch).toHaveBeenCalledWith("/__nudge_ui__/artifacts/artifact-2", { method: "DELETE", keepalive: true });
  expect(getWorkspaceChanges().canRedo).toBe(false);
});

it("clears only the active draft's edit steps and keeps canvas creation undoable", () => {
  const source = original();
  const variation = addCanvasVariation(source.id, "artifact-3")!;
  createStudyDraft(source.id, variation.id, studyArtifactId(getCanvasCards().find((card) => card.id === variation.id)?.content)!);
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
  const draft = createStudyDraft(source.id, variation.id, studyArtifactId(getCanvasCards().find((card) => card.id === variation.id)?.content)!)!;
  activateDraftForCard(variation.id);
  workspaceChangeStore.commitChangeRecords([text]);
  clearCommittedArtifactDraft(variation.id);
  expect(getDraftsSnapshot().drafts.find((item) => item.id === draft.id)?.contents.changes).toEqual([]);
  expect(getWorkspaceChanges().changes).toEqual([]);
  workspaceChangeStore.undoWorkspaceChange();
  expect(getCanvasCards()).toHaveLength(1);
});

it("releases detached studies when the page exits, but preserves them in the back-forward cache", () => {
  const source = original();
  const variation = addCanvasVariation(source.id, "artifact-exit")!;
  createStudyDraft(source.id, variation.id, studyArtifactId(getCanvasCards().find((card) => card.id === variation.id)?.content)!);
  workspaceChangeStore.undoWorkspaceChange();
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
  expect(fetch).not.toHaveBeenCalled();
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  expect(fetch).toHaveBeenCalledWith("/__nudge_ui__/artifacts/artifact-exit", { method: "DELETE", keepalive: true });
});

it("keeps a later group drag when undo removes a linked frame", () => {
  const source = original();
  const linked = duplicateCard(source.id)!;
  moveLinkedGroup(linked.groupId!, 120, 80);
  expect(workspaceChangeStore.undoWorkspaceChange()).toBe(true);
  expect(getCanvasCards()).toHaveLength(1);
  expect(getCanvasCards()[0]).toMatchObject({ id: source.id, x: source.x + 120, y: source.y + 80, groupId: undefined });
});
