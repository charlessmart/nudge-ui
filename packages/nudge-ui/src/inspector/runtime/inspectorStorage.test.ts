import { afterEach, describe, expect, it, vi } from "vitest";
import { configureInspectorStorage, createMirroredStorage, inspectorStorage } from "./inspectorStorage.ts";

afterEach(() => configureInspectorStorage(null));

describe("createMirroredStorage", () => {
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
