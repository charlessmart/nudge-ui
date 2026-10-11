import { afterEach, describe, expect, it, vi } from "vitest";
import { configureInspectorStorage, createMirroredStorage, inspectorStorage } from "./inspectorStorage.ts";

afterEach(() => configureInspectorStorage(null));

describe("createMirroredStorage", () => {
  it("refreshes newer backend values and deletions without writing them back", async () => {
    const backend = new Map([["comments", "newer comments"]]);
    const storage = createMirroredStorage({ comments: "old comments", deleted: "old draft" },
      (key, value) => { if (value === null) backend.delete(key); else backend.set(key, value); },
      async () => Object.fromEntries(backend));

    await storage.refresh!();

    expect(storage.getItem("comments")).toBe("newer comments");
    expect(storage.getItem("deleted")).toBeNull();
    expect(backend.get("deleted")).toBeUndefined();
  });

  it("keeps the current snapshot when refreshing fails", async () => {
    const storage = createMirroredStorage({ comments: "saved comments" }, () => undefined,
      async () => { throw new Error("Storage unavailable"); });

    await expect(storage.refresh!()).rejects.toThrow("Storage unavailable");

    expect(storage.getItem("comments")).toBe("saved comments");
  });

  it("ignores an older refresh response after a remount refresh has finished", async () => {
    let finishOldRead!: (snapshot: Record<string, string>) => void;
    const oldRead = new Promise<Record<string, string>>((resolve) => { finishOldRead = resolve; });
    const read = vi.fn().mockReturnValueOnce(oldRead).mockResolvedValueOnce({ comments: "new owner comments" });
    const storage = createMirroredStorage({}, () => undefined, read);
    const previousRefresh = storage.refresh!();

    await storage.refresh!();
    storage.setItem("comments", "new owner comments and next note");
    finishOldRead({ comments: "old comments" });
    await previousRefresh;

    expect(storage.getItem("comments")).toBe("new owner comments and next note");
  });

  it("serves the loaded snapshot and its own writes synchronously", () => {
    const storage = createMirroredStorage({ comments: "[]" }, () => undefined);

    storage.setItem("drafts", "{}");

    expect(storage.getItem("comments")).toBe("[]");
    expect(storage.getItem("drafts")).toBe("{}");
    expect(storage.getItem("missing")).toBeNull();
  });

  it("forwards writes and removals of stored keys", () => {
    const persist = vi.fn();
    const storage = createMirroredStorage({ comments: "[]" }, persist);

    storage.setItem("drafts", "{}");
    storage.removeItem("comments");
    storage.removeItem("missing");

    expect(persist.mock.calls).toEqual([["drafts", "{}"], ["comments", null]]);
  });
});

describe("inspectorStorage", () => {
  it("uses configured storage instead of localStorage", () => {
    const storage = createMirroredStorage({ key: "configured" }, () => undefined);

    configureInspectorStorage(storage);

    expect(inspectorStorage()).toBe(storage);
  });
});
