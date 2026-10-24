import { startWorkspaceController } from "../workspace/controller.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { iterationId } from "../canvas/frameContent.ts";
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activateIframeWorkspace, addCanvasIteration, beginCardGeometryChange, duplicateCard, getCanvasCards, getSelectedCardId, hydrateCanvasStore, resizeCard, selectCard, setCardPosition } from "../canvas/canvasStore.ts";
import { clearSessionUndoHistory } from "./timeline.ts";
import type { ElementChangeRecord, TextContentChangeRecord } from "../changes/types.ts";
import type { StructuralMove } from "../changes/structuralTypes.ts";
import {
  activateDraftForCard,
  appendChanges,
  clearActiveDraft,
  clearSavedIterationDraft,
  commitStructuralChange,
  draftIdForCard,
  getActiveDraftChanges,
  getDraftContentsForCard,
  getDraftsSnapshot,
  redo,
  resetDrafts,
  undo,
} from "../drafts/store.ts";
import { removeFrame } from "./commands.ts";

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
  hydrateCanvasStore("canvas", [], { x: 0, y: 0, zoom: 1 });
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  controller = startWorkspaceController();
});
afterEach(() => { controller.dispose(); configureNudgeUiRuntime(runtime); resetDrafts(); vi.unstubAllGlobals(); });

function original() {
  const card = activateIframeWorkspace(window.location.href, { width: 800, height: 600 })!;
  activateDraftForCard(card.id);
  return card;
}

it("undoes text, DOM movement, and iteration creation in order, then redoes the same frame and draft", () => {
  const source = original();
  appendChanges([style]);
  const iteration = addCanvasIteration(source.id, "artifact-1")!;
  selectCard(iteration.id);
  activateDraftForCard(iteration.id);
  commitStructuralChange(move);
  appendChanges([text]);
  selectCard(source.id);
  activateDraftForCard(source.id);

  expect(undo()).toBe(true);
  expect(getSelectedCardId()).toBe(iteration.id);
  expect(getActiveDraftChanges()).toMatchObject({ changes: [], structuralChanges: [move] });
  expect(getDraftContentsForCard(source.id)?.changes).toMatchObject([style]);
  undo();
  expect(getActiveDraftChanges().structuralChanges).toEqual([]);
  undo();
  expect(getCanvasCards().map((card) => card.id)).toEqual([source.id]);
  expect(getActiveDraftChanges().changes).toMatchObject([style]);
  expect(fetch).not.toHaveBeenCalled();

  redo();
  expect(iterationId(getCanvasCards().find((card) => card.id === iteration.id)?.content)).toBe("artifact-1");
  expect(getSelectedCardId()).toBe(iteration.id);
  redo();
  redo();
  expect(getActiveDraftChanges()).toMatchObject({ changes: [text], structuralChanges: [move] });
});

it("restores linked placement and releases an undone artifact when new edits discard redo", () => {
  const source = original();
  const linked = duplicateCard(source.id)!;
  undo();
  expect(getCanvasCards()).toHaveLength(1);
  redo();
  expect(getCanvasCards()[1]?.id).toBe(linked.id);
  expect(getCanvasCards()[1]).toMatchObject({ id: linked.id, x: linked.x, y: linked.y });
  const iteration = addCanvasIteration(linked.id, "artifact-2")!;
  undo();
  expect(fetch).not.toHaveBeenCalled();
  appendChanges([style]);
  expect(fetch).toHaveBeenCalledWith("/__nudge_ui__/artifacts/artifact-2", { method: "DELETE", keepalive: true });
  expect(getActiveDraftChanges().canRedo).toBe(false);
});

it("clears only the active draft's edit steps and keeps canvas creation undoable", () => {
  const source = original();
  const iteration = addCanvasIteration(source.id, "artifact-3")!;
  activateDraftForCard(iteration.id);
  appendChanges([text]);
  clearActiveDraft();
  expect(undo()).toBe(true);
  expect(getCanvasCards()).toHaveLength(1);
  clearSessionUndoHistory();
  expect(getActiveDraftChanges().canRedo).toBe(false);
});

it("committing an iteration clears its stored intent without clearing frame creation history", () => {
  const source = original();
  const iteration = addCanvasIteration(source.id, "artifact-4")!;
  const draftId = draftIdForCard(iteration.id)!;
  activateDraftForCard(iteration.id);
  appendChanges([text]);
  clearSavedIterationDraft(iteration.id);
  expect(getDraftsSnapshot().drafts.find((item) => item.id === draftId)?.contents.changes).toEqual([]);
  expect(getActiveDraftChanges().changes).toEqual([]);
  undo();
  expect(getCanvasCards()).toHaveLength(1);
});

it("releases detached iterations when the page exits, but preserves them in the back-forward cache", () => {
  const source = original();
  const iteration = addCanvasIteration(source.id, "artifact-exit")!;
  undo();
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
  expect(fetch).not.toHaveBeenCalled();
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  expect(fetch).toHaveBeenCalledWith("/__nudge_ui__/artifacts/artifact-exit", { method: "DELETE", keepalive: true });
});

it("keeps a later frame drag when undo removes a linked view", () => {
  const source = original();
  const linked = duplicateCard(source.id)!;
  setCardPosition(source.id, source.x + 120, source.y + 80);
  expect(undo()).toBe(true);
  expect(getCanvasCards()).toHaveLength(1);
  expect(getCanvasCards()[0]).toMatchObject({ id: source.id, x: source.x + 120, y: source.y + 80 });
});

it("undoes a frame move before the edit that preceded it, then redoes the move", () => {
  const source = original();
  appendChanges([style]);
  const commit = beginCardGeometryChange(source.id);
  setCardPosition(source.id, source.x + 10, source.y + 10);
  setCardPosition(source.id, source.x + 300, source.y + 120);
  commit();

  expect(undo()).toBe(true);
  expect(getCanvasCards()[0]).toMatchObject({ x: source.x, y: source.y });
  expect(getActiveDraftChanges().changes).toMatchObject([style]);
  expect(undo()).toBe(true);
  expect(getActiveDraftChanges().changes).toEqual([]);
  redo();
  redo();
  expect(getCanvasCards()[0]).toMatchObject({ x: source.x + 300, y: source.y + 120 });
  expect(getActiveDraftChanges().changes).toMatchObject([style]);
});

it("undoes a frame resize as one step and ignores gestures that leave the frame unchanged", () => {
  const source = original();
  const click = beginCardGeometryChange(source.id);
  click();
  expect(getActiveDraftChanges().canUndo).toBe(false);

  const commit = beginCardGeometryChange(source.id);
  resizeCard(source.id, 640, 480, { x: source.x - 20, y: source.y });
  resizeCard(source.id, 600, 400, { x: source.x - 40, y: source.y });
  commit();
  commit();

  expect(undo()).toBe(true);
  expect(getCanvasCards()[0]).toMatchObject({ x: source.x, y: source.y, width: source.width, height: source.height });
  expect(getActiveDraftChanges().canUndo).toBe(false);
});

it("restores a deleted live frame and its edits before undoing the earlier edit", () => {
  const source = original();
  const removed = activateIframeWorkspace(new URL("/other", window.location.href).href, { width: 400, height: 600 })!;
  selectCard(removed.id);
  activateDraftForCard(removed.id);
  appendChanges([style]);
  setCardPosition(removed.id, 1200, 80);
  const snapshot = getCanvasCards().find((card) => card.id === removed.id)!;

  expect(removeFrame(removed.id)).toBe(true);
  expect(getCanvasCards().map((card) => card.id)).toEqual([source.id]);
  expect(undo()).toBe(true);
  expect(getCanvasCards().find((card) => card.id === removed.id)).toEqual(snapshot);
  expect(getSelectedCardId()).toBe(removed.id);
  expect(getDraftContentsForCard(removed.id)?.changes).toEqual([style]);
  expect(undo()).toBe(true);
  expect(getDraftContentsForCard(removed.id)?.changes).toEqual([]);
  redo();
  redo();
  expect(getCanvasCards().map((card) => card.id)).toEqual([source.id]);
  undo();
  expect(getDraftContentsForCard(removed.id)?.changes).toEqual([style]);
});

it("keeps a deleted iteration's file and draft available until removal can no longer be undone", () => {
  const source = original();
  const iteration = addCanvasIteration(source.id, "artifact-deleted")!;
  selectCard(iteration.id);
  activateDraftForCard(iteration.id);
  clearSessionUndoHistory();
  appendChanges([text]);
  const draftId = draftIdForCard(iteration.id)!;

  removeFrame(iteration.id);
  expect(fetch).not.toHaveBeenCalled();
  expect(getDraftsSnapshot().drafts.find((draft) => draft.id === draftId)?.contents.changes).toEqual([text]);
  expect(undo()).toBe(true);
  expect(getSelectedCardId()).toBe(iteration.id);
  expect(getDraftContentsForCard(iteration.id)?.changes).toEqual([text]);
  redo();
  clearSessionUndoHistory();
  expect(fetch).toHaveBeenCalledWith("/__nudge_ui__/artifacts/artifact-deleted", { method: "DELETE", keepalive: true });
  expect(getDraftsSnapshot().drafts.some((draft) => draft.id === draftId)).toBe(false);
});
