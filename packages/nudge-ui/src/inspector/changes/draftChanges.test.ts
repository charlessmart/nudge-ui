// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ElementChangeRecord } from "./types.ts";
import type { StructuralDelete } from "./structuralTypes.ts";
import * as workspaceLease from "../canvas/workspaceLease.ts";
import { applicationTarget, targetKey } from "../drafts/model.ts";
import {
  commitChangeRecords,
  createChangeHistoryGroup,
  commitStructuralChange,
  getActiveDraftChanges,
  redoChange,
  resetDraftChanges,
  restoreActiveDraftChanges,
  subscribeActiveDraftChanges,
  undoChange,
  draftChangeStore,
} from "./draftChanges.ts";

const project = (): void => undefined;

function styleChange(property: string, rawValue: string): ElementChangeRecord {
  return {
    cid: "Button",
    file: "src/Button.tsx",
    line: 1,
    selector: '[data-cid="Button"]',
    property,
    oldToken: null,
    newToken: null,
    oldRawValue: "initial",
    rawValue,
    source: { file: "src/Button.tsx", line: 1, component: "Button" },
  };
}

const structuralDelete: StructuralDelete = {
  id: "delete-button",
  kind: "delete",
  target: {
    sourceSite: { cid: "Button", src: "src/Button.tsx:1:1" },
    locator: { kind: "evidence", occurrence: 0, props: null, text: "Save" },
  },
};

describe("DraftChanges", () => {
  beforeEach(() => resetDraftChanges());

  it("keeps separate drags and unrelated edits as separate undo steps", () => {
    const firstDrag = createChangeHistoryGroup();
    firstDrag(() => commitChangeRecords([styleChange("padding", "8px")], project));
    firstDrag(() => commitChangeRecords([styleChange("padding", "16px")], project));
    commitChangeRecords([styleChange("color", "red")], project);
    const secondDrag = createChangeHistoryGroup();
    secondDrag(() => commitChangeRecords([styleChange("padding", "20px")], project));
    secondDrag(() => commitChangeRecords([styleChange("padding", "24px")], project));

    expect(undoChange(project)).toBe(true);
    expect(getActiveDraftChanges().changes).toMatchObject([
      { property: "padding", rawValue: "16px" },
      { property: "color", rawValue: "red" },
    ]);
    expect(undoChange(project)).toBe(true);
    expect(getActiveDraftChanges().changes).toMatchObject([{ property: "padding", rawValue: "16px" }]);
    expect(undoChange(project)).toBe(true);
    expect(getActiveDraftChanges().changes).toEqual([]);
    expect(undoChange(project)).toBe(false);
  });

  it("does not group an unrelated edit made between gesture updates", () => {
    const drag = createChangeHistoryGroup();
    drag(() => commitChangeRecords([styleChange("padding", "8px")], project));
    commitChangeRecords([styleChange("color", "red")], project);
    drag(() => commitChangeRecords([styleChange("padding", "16px")], project));
    expect(undoChange(project)).toBe(true);
    expect(getActiveDraftChanges().changes).toMatchObject([
      { property: "padding", rawValue: "8px" },
      { property: "color", rawValue: "red" },
    ]);
  });

  it("undoes mixed intent in commit order", () => {
    commitChangeRecords([styleChange("color", "red")], project);
    commitStructuralChange(structuralDelete, project);
    commitChangeRecords([styleChange("background", "blue")], project);

    expect(undoChange(project)).toBe(true);
    expect(getActiveDraftChanges()).toMatchObject({
      changes: [{ property: "color" }],
      structuralChanges: [structuralDelete],
    });

    expect(undoChange(project)).toBe(true);
    expect(getActiveDraftChanges().structuralChanges).toEqual([]);
    expect(redoChange(project)).toBe(true);
    expect(getActiveDraftChanges().structuralChanges).toEqual([structuralDelete]);
  });

  it("publishes one complete snapshot for restore", () => {
    const observed: Array<{ changes: number; structuralChanges: number }> = [];
    const unsubscribe = subscribeActiveDraftChanges(() => {
      const current = getActiveDraftChanges();
      observed.push({
        changes: current.changes.length,
        structuralChanges: current.structuralChanges.length,
      });
    });

    restoreActiveDraftChanges({
      changes: [styleChange("color", "red")],
      structuralChanges: [structuralDelete],
    }, project);

    expect(observed).toEqual([{ changes: 1, structuralChanges: 1 }]);
    unsubscribe();
  });

  it("exposes the complete snapshot and preserves commit and undo results", () => {
    expect(draftChangeStore.getSnapshot()).toEqual({
      draftId: targetKey(applicationTarget()),
      revision: 0,
      changes: [],
      structuralChanges: [],
      canUndo: false,
      canRedo: false,
    });

    const change = styleChange("color", "red");
    expect(draftChangeStore.commitChangeRecords([])).toBe("unchanged");
    expect(draftChangeStore.commitChangeRecords([change])).toBe("applied");
    expect(draftChangeStore.commitChangeRecords([change])).toBe("unchanged");
    expect(draftChangeStore.getSnapshot()).toMatchObject({
      revision: 1,
      changes: [change],
      structuralChanges: [],
      canUndo: true,
      canRedo: false,
    });

    expect(draftChangeStore.undoChange()).toBe(true);
    expect(draftChangeStore.getSnapshot()).toMatchObject({
      revision: 2,
      changes: [],
      canUndo: false,
      canRedo: true,
    });
    expect(draftChangeStore.redoChange()).toBe(true);
    expect(draftChangeStore.getSnapshot()).toMatchObject({
      revision: 3,
      changes: [change],
      canUndo: true,
      canRedo: false,
    });
  });

  it("does not expose mutable canonical records through a snapshot", () => {
    draftChangeStore.commitChangeRecords([styleChange("color", "red")]);
    const current = draftChangeStore.getSnapshot();
    const change = current.changes[0] as ElementChangeRecord;

    expect(Object.isFrozen(current)).toBe(true);
    expect(Object.isFrozen(current.changes)).toBe(true);
    expect(Object.isFrozen(change)).toBe(true);
    expect(Object.isFrozen(change.source)).toBe(true);
    expect(() => {
      change.source.file = "src/Other.tsx";
    }).toThrow();
    expect(draftChangeStore.getSnapshot().changes[0]).toMatchObject({
      source: { file: "src/Button.tsx" },
    });
  });

  it("rejects a duplicate structural id without publishing or adding history", () => {
    let notifications = 0;
    const unsubscribe = subscribeActiveDraftChanges(() => {
      notifications += 1;
    });

    expect(commitStructuralChange(structuralDelete, project)).toBe(true);
    expect(commitStructuralChange({
      ...structuralDelete,
      target: {
        ...structuralDelete.target,
        locator: { ...structuralDelete.target.locator, text: "Different target" },
      },
    }, project)).toBe(false);

    expect(getActiveDraftChanges()).toMatchObject({
      revision: 1,
      structuralChanges: [structuralDelete],
    });
    expect(notifications).toBe(1);
    expect(undoChange(project)).toBe(true);
    expect(undoChange(project)).toBe(false);
    unsubscribe();
  });

  it("preserves blocked as distinct from unchanged", () => {
    const canWrite = vi.spyOn(workspaceLease, "canWriteWorkspace").mockReturnValue(false);

    expect(draftChangeStore.commitChangeRecords([styleChange("color", "red")])).toBe("blocked");
    expect(draftChangeStore.getSnapshot()).toMatchObject({
      draftId: targetKey(applicationTarget()),
      revision: 0,
      changes: [],
    });

    canWrite.mockRestore();
  });

});
