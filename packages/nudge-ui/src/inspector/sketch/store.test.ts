// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
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
import {
  SKETCH_STROKE_COLOR,
  SKETCH_STROKE_OUTLINE,
  type SketchCaptureMetadata,
} from "./model.ts";

const projectId = "sketch-store-project";
const image = new Blob(["png"], { type: "image/png" });
let previousConfig = getNudgeUiRuntimeConfig();
const capture: SketchCaptureMetadata = {
  url: "http://localhost:5173/",
  title: "Fixture",
  timestamp: 1,
  viewportWidth: 800,
  viewportHeight: 600,
  scrollX: 0,
  scrollY: 0,
  devicePixelRatio: 1,
  host: "vite-react",
  framework: "React",
  imageWidth: 1,
  imageHeight: 1,
};

function configureFixture(): void {
  configureNudgeUiRuntime({
    ...getNudgeUiRuntimeConfig(),
    projectId,
    host: "vite-react",
    framework: "React",
  });
}

function createSketch(description: string, id?: string) {
  return saveSketch({
    ...(id ? { id } : {}),
    capture,
    description,
    strokes: [],
    imageWidth: 1,
    imageHeight: 1,
    originalImage: image,
    annotatedImage: image,
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
    const records = { documents: new Map(), handoffs: new Map() };
    const storage: SketchStorage = {
      read: async () => ({ documents: [...records.documents.values()], handoffs: [...records.handoffs.values()] }),
      update: async (_projectId, change) => {
        changes.push(change);
        change.documents?.forEach((document) => records.documents.set(document.id, document));
        change.handoffs?.forEach((handoff) => records.handoffs.set(handoff.id, handoff));
        change.deleteDocumentIds?.forEach((id) => records.documents.delete(id));
        change.deleteHandoffIds?.forEach((id) => records.handoffs.delete(id));
      },
    };
    configureSketchStorage(storage);
    try {
      const document = await createSketch("Stored by the extension");
      expect(changes[0]?.documents?.map((saved) => saved.id)).toEqual([document.id]);

      resetSketchStore();
      await initializeSketchStore(projectId);
      expect(getSketches().map((item) => item.document.id)).toEqual([document.id]);

      await removeSketch(document.id);
      expect(changes.at(-1)?.deleteDocumentIds).toEqual([document.id]);
      expect(records.documents.size).toBe(0);
    } finally {
      configureSketchStorage(null);
    }
    expect(await readSketchPersistence(projectId)).toEqual({ documents: [], handoffs: [] });
  });

  it("explains a full configured storage instead of a generic save failure", async () => {
    configureSketchStorage({
      read: async () => ({ documents: [], handoffs: [] }),
      update: async () => {
        throw new Error("Resource::kQuotaBytes quota exceeded");
      },
    });
    try {
      await expect(createSketch("Too large")).rejects.toThrow(SKETCH_STORAGE_FULL_MESSAGE);
    } finally {
      configureSketchStorage(null);
    }
  });

  it("saves a revision without storing image bytes in its record", async () => {
    const document = await saveSketch({
      capture,
      description: "Align the card with the heading",
      strokes: [{
        id: "stroke-1",
        width: 6,
        color: SKETCH_STROKE_COLOR,
        outlineColor: SKETCH_STROKE_OUTLINE,
        points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      }],
      annotations: [{
        id: "annotation-1",
        number: 1,
        point: { x: 1, y: 1 },
        description: "Done button",
      }],
      imageWidth: 1,
      imageHeight: 1,
      originalImage: image,
      annotatedImage: image,
    });

    expect(document.filename).toBe(`sketch-${document.id}-r1.png`);
    expect(document.annotations).toEqual([expect.objectContaining({ number: 1, description: "Done button" })]);
    expect(getSketches()[0]).toMatchObject({ document: { id: document.id, revision: 1 } });
  });

  it("keeps the three latest sketches, removing the oldest from storage too", async () => {
    // Saves in the same millisecond tie on time, so each one gets its own.
    let clock = 1_000;
    const now = vi.spyOn(Date, "now").mockImplementation(() => (clock += 10));
    const first = await createSketch("First copy");
    const second = await createSketch("Second copy");
    const third = await createSketch("Third copy");
    const fourth = await createSketch("Fourth copy");
    now.mockRestore();

    const kept = [fourth.id, third.id, second.id];
    expect(getSketches().map((item) => item.document.id)).toEqual(kept);
    const stored = await readSketchPersistence(projectId);
    expect(stored.documents.map((document) => document.id).sort()).toEqual([...kept].sort());
    expect(stored.handoffs.every((handoff) => kept.includes(handoff.sketchId))).toBe(true);
    expect(stored.documents.some((document) => document.id === first.id)).toBe(false);
  });

  it("restores the kept sketch after a reload", async () => {
    const kept = await createSketch("Copied before reloading");

    resetSketchStore();
    await initializeSketchStore(projectId);

    expect(getSketches().map((item) => item.document.id)).toEqual([kept.id]);
  });

  it("shows only the newest when older sketches were left in storage by an earlier version", async () => {
    const records = { documents: new Map<string, unknown>(), handoffs: new Map<string, unknown>() };
    configureSketchStorage({
      read: async () => ({ documents: [...records.documents.values()] as never, handoffs: [...records.handoffs.values()] as never }),
      update: async (_projectId, change) => {
        change.documents?.forEach((document) => records.documents.set(document.id, document));
        change.handoffs?.forEach((handoff) => records.handoffs.set(handoff.id, handoff));
        change.deleteDocumentIds?.forEach((id) => records.documents.delete(id));
        change.deleteHandoffIds?.forEach((id) => records.handoffs.delete(id));
      },
    });
    try {
      const older = await createSketch("Older");
      // An earlier version kept up to four sketches; put a second one straight into storage.
      const newer = { ...older, id: "newer-sketch", updatedAt: older.updatedAt + 1000, createdAt: older.createdAt + 1000 };
      records.documents.set(newer.id, newer);

      resetSketchStore();
      await initializeSketchStore(projectId);

      expect(getSketches()[0]?.document.id).toBe(newer.id);
    } finally {
      configureSketchStorage(null);
    }
  });

  it("removes the kept sketch entirely", async () => {
    const document = await createSketch("Review this area");

    await expect(removeSketch(document.id)).resolves.toBe(true);

    expect(getSketches()).toHaveLength(0);
    expect(await readSketchPersistence(projectId)).toEqual({ documents: [], handoffs: [] });
    await expect(removeSketch(document.id)).resolves.toBe(false);
  });
});

describe("demo runtimes", () => {
  it("keeps sketches session-only and starts every visit clean", async () => {
    configureNudgeUiRuntime({ ...getNudgeUiRuntimeConfig(), demo: true, projectId });
    resetSketchStore();
    resetSketchMemory();
    await initializeSketchStore(projectId);

    await createSketch("Demo annotation");
    expect(getSketches()).toHaveLength(1);

    resetSketchStore();
    resetSketchMemory();
    await initializeSketchStore(projectId);
    expect(getSketches()).toHaveLength(0);
  });
});
