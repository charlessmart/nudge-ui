import { startWorkspaceController } from "../workspace/controller.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { iterationId } from "../canvas/frameContent.ts";
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activateIframeWorkspace, addCanvasIteration, duplicateCard, getCanvasCards, getSelectedCardId, hydrateCanvasStore, selectCard, setCardPosition } from "../canvas/canvasStore.ts";
import { draftChangeStore, getActiveDraftChanges, resetDraftChanges, clearSessionUndoHistory } from "../changes/draftChanges.ts";
import type { ElementChangeRecord, TextContentChangeRecord } from "../changes/types.ts";
import type { StructuralMove } from "../changes/structuralTypes.ts";
import { activateDraftForCard, draftIdForCard, getDraftContentsForCard, resetDrafts, clearSavedIterationDraft, getDraftsSnapshot } from "../drafts/store.ts";

const style: ElementChangeRecord = {
  cid: "Heading", file: "iteration.html", line: 1, selector: '[data-cid="Heading"]',
  property: "color", oldToken: null, newToken: null, oldRawValue: "black", rawValue: "red",
  source: { file: "iteration.html", line: 1, component: "Heading" },
};
const text: TextContentChangeRecord = {
  kind: "text-content", id: "heading-text", selector: '[data-cid="Heading"]',
  target: { sourceSite: { cid: "Heading", src: "iteration.html:1:1" }, occurrence: 0, props: null, ariaLabel: null, beforeText: "Before" },
  source: { file: "iteration.html", line: 1, column: 1, component: "Heading" },
  before: "Before", after: "After", authoredAs: "literal",
};
const move: StructuralMove = {
  kind: "move", id: "move-heading",
  target: { sourceSite: { cid: "Heading", src: "iteration.html:1:1" }, locator: { kind: "evidence", occurrence: 0, props: null, text: "Before" } },
  source: { parent: { sourceSite: { cid: "Parent", src: "iteration.html:2:1" }, locator: { kind: "evidence", occurrence: 0, props: null, text: "" } } },
  destination: { parent: { sourceSite: { cid: "Parent", src: "iteration.html:2:1" }, locator: { kind: "evidence", occurrence: 0, props: null, text: "" } }, before: null },
  presentation: { sourceParentTag: "section", destinationParentTag: "section", fromIndex: 0, toIndex: 1 },
};

let controller: ReturnType<typeof startWorkspaceController>;
const runtime = getNudgeUiRuntimeConfig();
beforeEach(() => {
  configureNudgeUiRuntime({ ...runtime, projectId: "session-test", demo: true });
  resetDrafts();
  resetDraftChanges();
  hydrateCanvasStore("canvas", [], { x: 0, y: 0, zoom: 1 });
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  controller = startWorkspaceController();
});
afterEach(() => { controller.dispose(); configureNudgeUiRuntime(runtime); resetDrafts(); resetDraftChanges(); vi.unstubAllGlobals(); });

function original() {
  const card = activateIframeWorkspace(window.location.href, { width: 800, height: 600 })!;
  activateDraftForCard(card.id);
  return card;
}

it("undoes text, DOM movement, and iteration creation in order, then redoes the same frame and draft", () => {
  const source = original();
  draftChangeStore.commitChangeRecords([style]);
  const iteration = addCanvasIteration(source.id, "artifact-1")!;
  selectCard(iteration.id);
  activateDraftForCard(iteration.id);
  draftChangeStore.commitStructuralChange(move);
  draftChangeStore.commitChangeRecords([text]);
  selectCard(source.id);
  activateDraftForCard(source.id);

  expect(draftChangeStore.undoChange()).toBe(true);
  expect(getSelectedCardId()).toBe(iteration.id);
  expect(getActiveDraftChanges()).toMatchObject({ changes: [], structuralChanges: [move] });
  expect(getDraftContentsForCard(source.id)?.changes).toMatchObject([style]);
  draftChangeStore.undoChange();
  expect(getActiveDraftChanges().structuralChanges).toEqual([]);
  draftChangeStore.undoChange();
  expect(getCanvasCards().map((card) => card.id)).toEqual([source.id]);
  expect(getActiveDraftChanges().changes).toMatchObject([style]);
  expect(fetch).not.toHaveBeenCalled();

  draftChangeStore.redoChange();
  expect(iterationId(getCanvasCards().find((card) => card.id === iteration.id)?.content)).toBe("artifact-1");
  expect(getSelectedCardId()).toBe(iteration.id);
  draftChangeStore.redoChange();
  draftChangeStore.redoChange();
  expect(getActiveDraftChanges()).toMatchObject({ changes: [text], structuralChanges: [move] });
});

it("restores linked placement and releases an undone artifact when new edits discard redo", () => {
  const source = original();
  const linked = duplicateCard(source.id)!;
  draftChangeStore.undoChange();
  expect(getCanvasCards()).toHaveLength(1);
  expect(getCanvasCards()[0]?.groupId).toBeUndefined();
  draftChangeStore.redoChange();
  expect(getCanvasCards()[1]?.id).toBe(linked.id);
  expect(getCanvasCards()[1]).toMatchObject({ id: linked.id, x: linked.x, y: linked.y });
  const iteration = addCanvasIteration(linked.id, "artifact-2")!;
  draftChangeStore.undoChange();
  expect(fetch).not.toHaveBeenCalled();
  draftChangeStore.commitChangeRecords([style]);
  expect(fetch).toHaveBeenCalledWith("/__nudge_ui__/artifacts/artifact-2", { method: "DELETE", keepalive: true });
  expect(getActiveDraftChanges().canRedo).toBe(false);
});

it("clears only the active draft's edit steps and keeps canvas creation undoable", () => {
  const source = original();
  const iteration = addCanvasIteration(source.id, "artifact-3")!;
  activateDraftForCard(iteration.id);
  draftChangeStore.commitChangeRecords([text]);
  draftChangeStore.clearActiveDraftChanges();
  expect(draftChangeStore.undoChange()).toBe(true);
  expect(getCanvasCards()).toHaveLength(1);
  clearSessionUndoHistory();
  expect(getActiveDraftChanges().canRedo).toBe(false);
});

it("committing an iteration clears its stored intent without clearing frame creation history", () => {
  const source = original();
  const iteration = addCanvasIteration(source.id, "artifact-4")!;
  const draftId = draftIdForCard(iteration.id)!;
  activateDraftForCard(iteration.id);
  draftChangeStore.commitChangeRecords([text]);
  clearSavedIterationDraft(iteration.id);
  expect(getDraftsSnapshot().drafts.find((item) => item.id === draftId)?.contents.changes).toEqual([]);
  expect(getActiveDraftChanges().changes).toEqual([]);
  draftChangeStore.undoChange();
  expect(getCanvasCards()).toHaveLength(1);
});

it("releases detached iterations when the page exits, but preserves them in the back-forward cache", () => {
  const source = original();
  const iteration = addCanvasIteration(source.id, "artifact-exit")!;
  draftChangeStore.undoChange();
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
  expect(fetch).not.toHaveBeenCalled();
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  expect(fetch).toHaveBeenCalledWith("/__nudge_ui__/artifacts/artifact-exit", { method: "DELETE", keepalive: true });
});

it("keeps a later frame drag when undo removes a linked view", () => {
  const source = original();
  const linked = duplicateCard(source.id)!;
  setCardPosition(source.id, source.x + 120, source.y + 80);
  expect(draftChangeStore.undoChange()).toBe(true);
  expect(getCanvasCards()).toHaveLength(1);
  expect(getCanvasCards()[0]).toMatchObject({ id: source.id, x: source.x + 120, y: source.y + 80 });
});
