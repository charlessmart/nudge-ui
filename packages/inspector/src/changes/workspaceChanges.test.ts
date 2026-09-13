// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ElementChangeRecord } from "./types.ts";
import type { StructuralDelete } from "./structuralTypes.ts";
import * as workspaceLease from "../canvas/workspaceLease.ts";
import {
  commitChangeRecords,
  commitStructuralChange,
  getWorkspaceChanges,
  redoWorkspaceChange,
  resetWorkspaceChanges,
  restoreWorkspaceChanges,
  subscribeWorkspaceChanges,
  undoWorkspaceChange,
  workspaceChangeStore,
} from "./workspaceChanges.ts";

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

describe("WorkspaceChanges", () => {
  beforeEach(() => resetWorkspaceChanges());

  it("undoes mixed intent in commit order", () => {
    commitChangeRecords([styleChange("color", "red")], project);
    commitStructuralChange(structuralDelete, project);
    commitChangeRecords([styleChange("background", "blue")], project);

    expect(undoWorkspaceChange(project)).toBe(true);
    expect(getWorkspaceChanges()).toMatchObject({
      changes: [{ property: "color" }],
      structuralChanges: [structuralDelete],
    });

    expect(undoWorkspaceChange(project)).toBe(true);
    expect(getWorkspaceChanges().structuralChanges).toEqual([]);
    expect(redoWorkspaceChange(project)).toBe(true);
    expect(getWorkspaceChanges().structuralChanges).toEqual([structuralDelete]);
  });

  it("publishes one complete snapshot for restore", () => {
    const observed: Array<{ changes: number; structuralChanges: number }> = [];
    const unsubscribe = subscribeWorkspaceChanges(() => {
      const current = getWorkspaceChanges();
      observed.push({
        changes: current.changes.length,
        structuralChanges: current.structuralChanges.length,
      });
    });

    restoreWorkspaceChanges({
      changes: [styleChange("color", "red")],
      structuralChanges: [structuralDelete],
    }, project);

    expect(observed).toEqual([{ changes: 1, structuralChanges: 1 }]);
    unsubscribe();
  });

  it("exposes the complete snapshot and preserves commit and undo results", () => {
    expect(workspaceChangeStore.getSnapshot()).toEqual({
      revision: 0,
      changes: [],
      structuralChanges: [],
      canUndo: false,
      canRedo: false,
    });

    const change = styleChange("color", "red");
    expect(workspaceChangeStore.commitChangeRecords([])).toBe("unchanged");
    expect(workspaceChangeStore.commitChangeRecords([change])).toBe("applied");
    expect(workspaceChangeStore.commitChangeRecords([change])).toBe("unchanged");
    expect(workspaceChangeStore.getSnapshot()).toMatchObject({
      revision: 1,
      changes: [change],
      structuralChanges: [],
      canUndo: true,
      canRedo: false,
    });

    expect(workspaceChangeStore.undoWorkspaceChange()).toBe(true);
    expect(workspaceChangeStore.getSnapshot()).toMatchObject({
      revision: 2,
      changes: [],
      canUndo: false,
      canRedo: true,
    });
    expect(workspaceChangeStore.redoWorkspaceChange()).toBe(true);
    expect(workspaceChangeStore.getSnapshot()).toMatchObject({
      revision: 3,
      changes: [change],
      canUndo: true,
      canRedo: false,
    });
  });

  it("does not expose mutable canonical records through a snapshot", () => {
    workspaceChangeStore.commitChangeRecords([styleChange("color", "red")]);
    const current = workspaceChangeStore.getSnapshot();
    const change = current.changes[0] as ElementChangeRecord;

    expect(Object.isFrozen(current)).toBe(true);
    expect(Object.isFrozen(current.changes)).toBe(true);
    expect(Object.isFrozen(change)).toBe(true);
    expect(Object.isFrozen(change.source)).toBe(true);
    expect(() => {
      change.source.file = "src/Other.tsx";
    }).toThrow();
    expect(workspaceChangeStore.getSnapshot().changes[0]).toMatchObject({
      source: { file: "src/Button.tsx" },
    });
  });

  it("rejects a duplicate structural id without publishing or adding history", () => {
    let notifications = 0;
    const unsubscribe = subscribeWorkspaceChanges(() => {
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

    expect(getWorkspaceChanges()).toMatchObject({
      revision: 1,
      structuralChanges: [structuralDelete],
    });
    expect(notifications).toBe(1);
    expect(undoWorkspaceChange(project)).toBe(true);
    expect(undoWorkspaceChange(project)).toBe(false);
    unsubscribe();
  });

  it("preserves blocked as distinct from unchanged", () => {
    const canWrite = vi.spyOn(workspaceLease, "canWriteWorkspace").mockReturnValue(false);

    expect(workspaceChangeStore.commitChangeRecords([styleChange("color", "red")])).toBe("blocked");
    expect(workspaceChangeStore.getSnapshot()).toMatchObject({
      revision: 0,
      changes: [],
    });

    canWrite.mockRestore();
  });

});
