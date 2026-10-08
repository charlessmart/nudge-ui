// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { ElementChangeRecord } from "../changes/types.ts";
import type { StructuralDelete } from "../changes/structuralTypes.ts";
import { changeKey } from "../changes/model.ts";
import { createTimeline } from "../workspace/timeline.ts";
import { createDraftStore, type DraftProjectionEvent, type DraftStoreSeams } from "./draftStore.ts";
import { applicationTarget, htmlTarget, targetKey } from "./model.ts";

const OTHER_DRAFT = targetKey(htmlTarget("00000000-0000-4000-8000-000000000001"));

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

function setup(storage = new Map<string, string>(), onProject?: DraftStoreSeams["project"]) {
  const lease = { writable: true };
  const timeline = createTimeline();
  const projections: DraftProjectionEvent["kind"][] = [];
  const store = createDraftStore({
    canWrite: () => lease.writable,
    timeline,
    storage: {
      read: (key) => storage.get(key) ?? null,
      write: (key, value) => { storage.set(key, value); },
      remove: (key) => { storage.delete(key); },
    },
    sketches: {
      getSnapshot: () => ({ ready: true, documents: [] }),
      subscribe: () => () => undefined,
    },
    project: (snapshot, event) => {
      projections.push(event.kind);
      onProject?.(snapshot, event);
    },
  });
  return { store, storage, lease, timeline, projections };
}

describe("draft history", () => {
  it("keeps separate drags and unrelated edits as separate undo steps", () => {
    const { store, timeline } = setup();
    const firstDrag = timeline.createGroup();
    firstDrag(() => store.commitChanges([styleChange("padding", "8px")]));
    firstDrag(() => store.commitChanges([styleChange("padding", "16px")]));
    store.commitChanges([styleChange("color", "red")]);
    const secondDrag = timeline.createGroup();
    secondDrag(() => store.commitChanges([styleChange("padding", "20px")]));
    secondDrag(() => store.commitChanges([styleChange("padding", "24px")]));

    expect(store.undo()).toBe(true);
    expect(store.getActive().changes).toMatchObject([
      { property: "padding", rawValue: "16px" },
      { property: "color", rawValue: "red" },
    ]);
    expect(store.undo()).toBe(true);
    expect(store.getActive().changes).toMatchObject([{ property: "padding", rawValue: "16px" }]);
    expect(store.undo()).toBe(true);
    expect(store.getActive().changes).toEqual([]);
    expect(store.undo()).toBe(false);
  });

  it("does not group an unrelated edit made between gesture updates", () => {
    const { store, timeline } = setup();
    const drag = timeline.createGroup();
    drag(() => store.commitChanges([styleChange("padding", "8px")]));
    store.commitChanges([styleChange("color", "red")]);
    drag(() => store.commitChanges([styleChange("padding", "16px")]));

    expect(store.undo()).toBe(true);
    expect(store.getActive().changes).toMatchObject([
      { property: "padding", rawValue: "8px" },
      { property: "color", rawValue: "red" },
    ]);
  });

  it("undoes mixed intent in commit order", () => {
    const { store } = setup();
    store.commitChanges([styleChange("color", "red")]);
    store.commitStructuralChange(structuralDelete);
    store.commitChanges([styleChange("background", "blue")]);

    expect(store.undo()).toBe(true);
    expect(store.getActive()).toMatchObject({
      changes: [{ property: "color" }],
      structuralChanges: [structuralDelete],
    });
    expect(store.undo()).toBe(true);
    expect(store.getActive().structuralChanges).toEqual([]);
    expect(store.redo()).toBe(true);
    expect(store.getActive().structuralChanges).toEqual([structuralDelete]);
  });

  it("reconciles only verified records and no undo step restores them", () => {
    const { store } = setup();
    const verified = styleChange("background", "blue");
    store.commitChanges([verified]);
    store.commitChanges([styleChange("color", "red")]);

    expect(store.reconcile(store.getActive().draftId, new Set([changeKey(verified)]), new Set())).toBe(1);
    expect(store.getActive().changes).toMatchObject([{ property: "color" }]);
    while (store.undo()) expect(store.getActive().changes).not.toContainEqual(verified);
    while (store.redo()) expect(store.getActive().changes).not.toContainEqual(verified);
  });
});

describe("draft snapshots", () => {
  it("reports revision, history, and commit results", () => {
    const { store } = setup();
    expect(store.getActive()).toEqual({
      draftId: targetKey(applicationTarget()),
      revision: 0,
      changes: [],
      structuralChanges: [],
      canUndo: false,
      canRedo: false,
    });

    const change = styleChange("color", "red");
    expect(store.commitChanges([])).toBe("unchanged");
    expect(store.commitChanges([change])).toBe("applied");
    expect(store.commitChanges([change])).toBe("unchanged");
    expect(store.getActive()).toMatchObject({ revision: 1, changes: [change], canUndo: true, canRedo: false });

    expect(store.undo()).toBe(true);
    expect(store.getActive()).toMatchObject({ revision: 2, changes: [], canUndo: false, canRedo: true });
    expect(store.redo()).toBe(true);
    expect(store.getActive()).toMatchObject({ revision: 3, changes: [change], canUndo: true, canRedo: false });
  });

  it("does not expose mutable canonical records", () => {
    const { store } = setup();
    store.commitChanges([styleChange("color", "red")]);
    const current = store.getActive();
    const change = current.changes[0] as ElementChangeRecord;

    expect(Object.isFrozen(current)).toBe(true);
    expect(Object.isFrozen(current.changes)).toBe(true);
    expect(() => { change.source.file = "src/Other.tsx"; }).toThrow();
    expect(store.getActive().changes[0]).toMatchObject({ source: { file: "src/Button.tsx" } });
  });

  it("rejects a duplicate structural id without publishing or adding history", () => {
    const { store } = setup();
    let notifications = 0;
    store.subscribeActive(() => { notifications += 1; });

    expect(store.commitStructuralChange(structuralDelete)).toBe(true);
    expect(store.commitStructuralChange({
      ...structuralDelete,
      target: { ...structuralDelete.target, locator: { ...structuralDelete.target.locator, text: "Other" } },
    })).toBe(false);

    expect(store.getActive()).toMatchObject({ revision: 1, structuralChanges: [structuralDelete] });
    expect(notifications).toBe(1);
    expect(store.undo()).toBe(true);
    expect(store.undo()).toBe(false);
  });
});

describe("write gating", () => {
  it("reports blocked, not unchanged, without the write lease", () => {
    const { store, lease } = setup();
    lease.writable = false;

    expect(store.commitChanges([styleChange("color", "red")])).toBe("blocked");
    expect(store.getActive()).toMatchObject({ revision: 0, changes: [] });
  });

  it("refuses edits and history replay for a locked draft until released", () => {
    const { store } = setup();
    store.commitChanges([styleChange("color", "red")]);
    const release = store.lock(store.getActive().draftId);

    expect(store.commitChanges([styleChange("color", "blue")])).toBe("blocked");
    expect(store.undo()).toBe(false);
    expect(() => store.lock(store.getActive().draftId)).toThrow();

    release();
    expect(store.commitChanges([styleChange("color", "blue")])).toBe("applied");
  });
});

describe("draft projection", () => {
  it("projects after subscribers observe the new snapshot", () => {
    const order: string[] = [];
    const { store } = setup(undefined, (snapshot) => { order.push(`project:${snapshot.revision}`); });
    store.subscribeActive(() => { order.push(`notify:${store.getActive().revision}`); });

    store.commitChanges([styleChange("color", "red")]);

    expect(order).toEqual(["notify:1", "project:1"]);
  });

  it("describes each operation with its projection event", () => {
    const { store, projections } = setup();
    const change = styleChange("color", "red");

    store.commitChanges([change]);
    store.reconcile(store.getActive().draftId, new Set([changeKey(change)]), new Set());
    store.activate(OTHER_DRAFT);
    store.clearActive();
    store.load("project");
    store.discardAll();

    expect(projections).toEqual(["edit", "reconcile", "switch", "reset", "switch", "reset"]);
  });

  it("projects an undo that returns to another draft once, as a switch", () => {
    const { store, projections } = setup();
    store.activate(OTHER_DRAFT);
    store.commitChanges([styleChange("color", "red")]);
    store.activate(targetKey(applicationTarget()));
    projections.length = 0;

    expect(store.undo()).toBe(true);

    expect(store.getActive().draftId).toBe(OTHER_DRAFT);
    expect(projections).toEqual(["switch"]);
  });

  it("does not project a draft that is not active", () => {
    const { store, projections } = setup();
    store.activate(OTHER_DRAFT);
    store.commitChanges([styleChange("color", "red")]);
    store.activate(targetKey(applicationTarget()));
    projections.length = 0;

    store.clear(OTHER_DRAFT);

    expect(store.get(OTHER_DRAFT).changes).toEqual([]);
    expect(projections).toEqual([]);
  });
});

describe("draft persistence", () => {
  it("restores stored drafts for the same project", () => {
    const storage = new Map<string, string>();
    const writer = setup(storage).store;
    writer.load("project");
    writer.commitChanges([styleChange("color", "red")]);
    writer.commitStructuralChange(structuralDelete);
    writer.persist();

    const reader = setup(storage).store;
    reader.load("project");

    expect(reader.getActive()).toMatchObject({
      revision: 2,
      changes: [{ property: "color", rawValue: "red" }],
      structuralChanges: [structuralDelete],
      canUndo: false,
    });
  });

  it("ignores drafts stored for another project", () => {
    const storage = new Map<string, string>();
    const writer = setup(storage).store;
    writer.load("project");
    writer.commitChanges([styleChange("color", "red")]);
    writer.persist();

    const reader = setup(storage).store;
    reader.load("other-project");

    expect(reader.getActive().changes).toEqual([]);
  });

  it("does not write storage without the write lease", () => {
    const { store, storage, lease } = setup();
    store.load("project");
    store.commitChanges([styleChange("color", "red")]);
    lease.writable = false;

    store.persist();

    expect(storage.size).toBe(0);
  });

  it("publishes one complete snapshot when loading", () => {
    const storage = new Map<string, string>();
    const writer = setup(storage).store;
    writer.load("project");
    writer.commitChanges([styleChange("color", "red")]);
    writer.commitStructuralChange(structuralDelete);
    writer.persist();
    const reader = setup(storage).store;
    const observed: Array<[number, number]> = [];
    reader.subscribeActive(() => {
      const { changes, structuralChanges } = reader.getActive();
      observed.push([changes.length, structuralChanges.length]);
    });

    reader.load("project");

    expect(observed).toEqual([[1, 1]]);
  });
});
