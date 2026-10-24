// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../../runtime/runtimeConfig.ts";
import {
  clearSketchesForProject,
  getSketches,
  initializeSketchStore,
  removeSketch,
  resetSketchStore,
  saveSketch,
} from "./store.ts";
import {
  configureSketchStorage,
  readSketchPersistence,
  resetSketchMemory,
  SKETCH_STORAGE_FULL_MESSAGE,
  type SketchStorage,
  type SketchStorageChange,
} from "./persistence.ts";
import { SKETCH_LIMITS, type SketchDocument } from "../../sketch/model.ts";

const projectId = "sketch-store-project";
const image = new Blob(["png"], { type: "image/png" });
const url = "http://localhost:5173/";
let previousConfig = getNudgeUiRuntimeConfig();

function configureFixture(): void {
  configureNudgeUiRuntime({
    ...getNudgeUiRuntimeConfig(),
    projectId,
    host: "vite-react",
    framework: "React",
  });
}

function createSketch() {
  return saveSketch({
    url,
    image,
    imageWidth: 1,
    imageHeight: 1,
  });
}

beforeEach(async () => {
  previousConfig = getNudgeUiRuntimeConfig();
  resetSketchStore();
  resetSketchMemory();
  configureFixture();
  await initializeSketchStore(projectId);
});

afterEach(async () => {
  await clearSketchesForProject(projectId).catch(() => undefined);
  resetSketchMemory();
  resetSketchStore();
  configureNudgeUiRuntime(previousConfig);
});

describe("sketch store", () => {
  it("persists through configured storage instead of the page's own storage", async () => {
    const changes: SketchStorageChange[] = [];
    const records = { documents: new Map<string, SketchDocument>() };
    const storage: SketchStorage = {
      read: async () => ({ documents: [...records.documents.values()] }),
      update: async (_projectId, change) => {
        changes.push(change);
        change.documents?.forEach((document) => records.documents.set(document.id, document));
        change.deleteDocumentIds?.forEach((id) => records.documents.delete(id));
      },
    };
    configureSketchStorage(storage);
    try {
      const document = await createSketch();
      expect(changes[0]?.documents?.map((saved) => saved.id)).toEqual([document.id]);

      resetSketchStore();
      await initializeSketchStore(projectId);
      expect(getSketches().map((saved) => saved.id)).toEqual([document.id]);

      await removeSketch(document.id);
      expect(changes.at(-1)?.deleteDocumentIds).toEqual([document.id]);
      expect(records.documents.size).toBe(0);
    } finally {
      configureSketchStorage(null);
    }
    expect(await readSketchPersistence(projectId)).toEqual({ documents: [] });
  });

  it("explains a full configured storage instead of a generic save failure", async () => {
    configureSketchStorage({
      read: async () => ({ documents: [] }),
      update: async () => {
        throw new Error("Resource::kQuotaBytes quota exceeded");
      },
    });
    try {
      await expect(createSketch()).rejects.toThrow(SKETCH_STORAGE_FULL_MESSAGE);
    } finally {
      configureSketchStorage(null);
    }
  });

  it("saves the copied image and the page it came from", async () => {
    const document = await saveSketch({
      url,
      image,
      imageWidth: 1,
      imageHeight: 1,
    });

    expect(document).toMatchObject({ url, imageWidth: 1, imageHeight: 1, schemaVersion: 2 });
    expect(document.image).toBe(image);
    expect(getSketches()[0]).toMatchObject({ id: document.id, url });
  });

  it("keeps the four latest sketches, removing the oldest from storage too", async () => {
    // Saves in the same millisecond tie on time, so each one gets its own.
    let clock = 1_000;
    const now = vi.spyOn(Date, "now").mockImplementation(() => (clock += 10));
    const first = await createSketch();
    const second = await createSketch();
    const third = await createSketch();
    const fourth = await createSketch();
    const fifth = await createSketch();
    now.mockRestore();

    const kept = [fifth.id, fourth.id, third.id, second.id];
    expect(getSketches().map((saved) => saved.id)).toEqual(kept);
    const stored = await readSketchPersistence(projectId);
    expect(stored.documents.map((document) => document.id).sort()).toEqual([...kept].sort());
    expect(stored.documents.some((document) => document.id === first.id)).toBe(false);
  });

  it("restores the kept sketch after a reload", async () => {
    const kept = await createSketch();

    resetSketchStore();
    await initializeSketchStore(projectId);

    expect(getSketches().map((saved) => saved.id)).toEqual([kept.id]);
  });

  it("restores at most the kept sketches when storage holds more", async () => {
    const records = { documents: new Map<string, SketchDocument>() };
    configureSketchStorage({
      read: async () => ({ documents: [...records.documents.values()] }),
      update: async (_projectId, change) => {
        change.documents?.forEach((document) => records.documents.set(document.id, document));
        change.deleteDocumentIds?.forEach((id) => records.documents.delete(id));
      },
    });
    try {
      const older = await createSketch();
      for (let index = 0; index < SKETCH_LIMITS.keptSketches; index += 1) {
        records.documents.set(`extra-${index}`, {
          ...older,
          id: `extra-${index}`,
          updatedAt: older.updatedAt + index + 1,
          createdAt: older.createdAt + index + 1,
        });
      }

      resetSketchStore();
      await initializeSketchStore(projectId);

      expect(getSketches()).toHaveLength(SKETCH_LIMITS.keptSketches);
      expect(getSketches()[0]?.id).toBe(`extra-${SKETCH_LIMITS.keptSketches - 1}`);
    } finally {
      configureSketchStorage(null);
    }
  });

  it("removes the kept sketch entirely", async () => {
    const document = await createSketch();

    await expect(removeSketch(document.id)).resolves.toBe(true);

    expect(getSketches()).toHaveLength(0);
    expect(await readSketchPersistence(projectId)).toEqual({ documents: [] });
    await expect(removeSketch(document.id)).resolves.toBe(false);
  });
});

describe("demo runtimes", () => {
  it("keeps sketches session-only and starts every visit clean", async () => {
    configureNudgeUiRuntime({ ...getNudgeUiRuntimeConfig(), demo: true, projectId });
    resetSketchStore();
    resetSketchMemory();
    await initializeSketchStore(projectId);

    await createSketch();
    expect(getSketches()).toHaveLength(1);

    resetSketchStore();
    resetSketchMemory();
    await initializeSketchStore(projectId);
    expect(getSketches()).toHaveLength(0);
  });
});
