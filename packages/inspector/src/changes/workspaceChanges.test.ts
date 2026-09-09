// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { ElementChangeRecord } from "./types.ts";
import type { StructuralDelete } from "./structuralTypes.ts";
import {
  commitChangeRecords,
  commitStructuralChange,
  getWorkspaceChanges,
  redoWorkspaceChange,
  replaceChangeRecordsForDiagnostics,
  resetWorkspaceChanges,
  restoreWorkspaceChanges,
  subscribeWorkspaceChanges,
  undoWorkspaceChange,
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

  it("publishes diagnostics without changing canonical revision or history", () => {
    const change = styleChange("color", "red");
    commitChangeRecords([change], project);
    const revision = getWorkspaceChanges().revision;
    let notifications = 0;
    const unsubscribe = subscribeWorkspaceChanges(() => {
      notifications += 1;
    });

    replaceChangeRecordsForDiagnostics([{
      ...change,
      previewResult: {
        requestedValue: "red",
        computedValue: "red",
        status: "applied",
      },
    }]);

    expect(getWorkspaceChanges().revision).toBe(revision);
    expect(getWorkspaceChanges().changes[0]).toMatchObject({
      previewResult: { status: "applied" },
    });
    expect(notifications).toBe(1);
    expect(undoWorkspaceChange(project)).toBe(true);
    expect(getWorkspaceChanges().changes).toEqual([]);
    unsubscribe();
  });
});
