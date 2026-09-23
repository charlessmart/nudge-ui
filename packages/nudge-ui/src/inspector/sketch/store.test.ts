// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { clearSketchClipboardHandoff, resetSketchClipboardHandoff } from "./handoff.ts";
import {
  clearSketchesForProject,
  getSketches,
  initializeSketchStore,
  markSketchesDispatching,
  markSketchesHandingOff,
  removeSketch,
  requeueSketch,
  resetSketchStore,
  saveSketch,
  settleSketchDispatch,
} from "./store.ts";
import { readSketchPersistence, resetSketchMemory } from "./persistence.ts";
import {
  SKETCH_STROKE_COLOR,
  SKETCH_STROKE_OUTLINE,
  toAgentSketchMetadata,
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
  resetSketchClipboardHandoff();
  configureFixture();
  await initializeSketchStore(projectId);
});

afterEach(async () => {
  clearSketchClipboardHandoff();
  await clearSketchesForProject(projectId).catch(() => undefined);
  resetSketchMemory();
  resetSketchStore();
  configureNudgeUiRuntime(previousConfig);
});

describe("sketch store", () => {
  it("saves a revision and tracks direct-delivery lifecycle without storing image bytes in status metadata", async () => {
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
    expect(toAgentSketchMetadata(document).annotations).toEqual([{ number: 1, description: "Done button" }]);
    expect(getSketches()[0]).toMatchObject({ document: { id: document.id, revision: 1 }, status: "pending" });

    const entry = [{ id: document.id, revision: document.revision }];
    await markSketchesDispatching(entry, 42, "batch-1");
    expect(getSketches()[0]?.status).toBe("dispatching");
    await markSketchesHandingOff(entry, 42, "batch-1", "agent-request");
    expect(getSketches()[0]).toMatchObject({ status: "handing-off", handoff: { agentRequestId: "agent-request" } });
    await settleSketchDispatch(42, "completed", "agent-request");
    expect(getSketches()).toEqual([]);
    expect(await readSketchPersistence(projectId)).toEqual({ documents: [], handoffs: [] });
  });

  it("removes only the completed batch and tolerates repeated completion", async () => {
    const first = await createSketch("Align the heading");
    const second = await createSketch("Move the button");
    const unrelated = await createSketch("Keep this note for later");
    await markSketchesDispatching([first, second], 42, "completed-batch");
    await markSketchesHandingOff([first, second], 42, "completed-batch", "completed-request");
    await markSketchesDispatching([unrelated], 42, "other-batch");

    await settleSketchDispatch(42, "completed", "completed-request", "completed-batch");
    await settleSketchDispatch(42, "completed", "completed-request", "completed-batch");

    expect(getSketches().map((item) => item.document.id)).toEqual([unrelated.id]);
    resetSketchStore();
    await initializeSketchStore(projectId);
    expect(getSketches().map((item) => item.document.id)).toEqual([unrelated.id]);
  });

  it("settles completion received while persisted sketches are still loading", async () => {
    const document = await createSketch("Align the heading");
    await markSketchesDispatching([document], 42, "restored-batch");
    await markSketchesHandingOff([document], 42, "restored-batch", "restored-request");
    resetSketchStore();
    const loading = initializeSketchStore(projectId);

    await settleSketchDispatch(42, "completed", "restored-request", "restored-batch");
    await loading;

    expect(getSketches()).toEqual([]);
    expect(await readSketchPersistence(projectId)).toEqual({ documents: [], handoffs: [] });
  });

  it("keeps a newer revision queued before the old request completes", async () => {
    const document = await createSketch("Align the heading");
    await markSketchesDispatching([document], 42, "old-batch");
    await markSketchesHandingOff([document], 42, "old-batch", "old-request");
    const saving = createSketch("Also change the color", document.id);
    const completion = settleSketchDispatch(42, "completed", "old-request", "old-batch");
    await Promise.all([saving, completion]);

    expect(getSketches()).toMatchObject([{
      document: { id: document.id, revision: 2, description: "Also change the color" },
      status: "pending",
    }]);
    resetSketchStore();
    await initializeSketchStore(projectId);
    expect(getSketches()[0]?.document.revision).toBe(2);
  });

  it.each(["failed", "interrupted"] as const)("keeps a restored sketch when its request is %s", async (status) => {
    const document = await createSketch("Align the heading");
    await markSketchesDispatching([document], 42, "restored-batch");
    await markSketchesHandingOff([document], 42, "restored-batch", "restored-request");
    resetSketchStore();
    await initializeSketchStore(projectId);

    await settleSketchDispatch(42, status, "restored-request", "restored-batch");

    expect(getSketches()).toMatchObject([{ document: { id: document.id }, status: "pending" }]);
  });

  it("ignores completion from a different request when no batch ID is available", async () => {
    const document = await createSketch("Align the heading");
    await markSketchesDispatching([document], 42, "current-batch");
    await markSketchesHandingOff([document], 42, "current-batch", "current-request");

    await settleSketchDispatch(42, "completed", "unrelated-request");

    expect(getSketches()).toMatchObject([{ document: { id: document.id }, status: "handing-off" }]);
  });

  it("keeps a requeued sketch when a delayed completion arrives for its old batch", async () => {
    const document = await createSketch("Align the heading");
    await markSketchesDispatching([document], 42, "old-batch");
    await markSketchesHandingOff([document], 42, "old-batch", "old-request");
    await requeueSketch(document.id);
    await markSketchesDispatching([document], 42, "retry-batch");

    await settleSketchDispatch(42, "completed", "old-request", "old-batch");

    expect(getSketches()).toMatchObject([{ document: { id: document.id }, status: "dispatching" }]);
  });

  it("does not restore deleted handoff metadata when the dispatch response arrives after completion", async () => {
    const document = await createSketch("Align the heading");
    await markSketchesDispatching([document], 42, "completed-batch");

    const completion = settleSketchDispatch(42, "completed", "completed-request", "completed-batch");
    const response = markSketchesHandingOff([document], 42, "completed-batch", "completed-request");
    await Promise.all([completion, response]);

    expect(getSketches()).toEqual([]);
    expect(await readSketchPersistence(projectId)).toEqual({ documents: [], handoffs: [] });
  });

  it("removes a sketch only after it is no longer in delivery", async () => {
    const document = await saveSketch({
      capture,
      description: "Review this area",
      strokes: [],
      imageWidth: 1,
      imageHeight: 1,
      originalImage: image,
      annotatedImage: image,
    });
    await markSketchesDispatching([{ id: document.id, revision: 1 }], 7, "batch-7");
    await expect(removeSketch(document.id)).resolves.toBe(false);
    await settleSketchDispatch(7, "failed");
    await expect(removeSketch(document.id)).resolves.toBe(true);
    expect(getSketches()).toHaveLength(0);
  });

  it("marks an interrupted delivery as unknown after restoration", async () => {
    const document = await saveSketch({
      capture,
      description: "Confirm the spacing here",
      strokes: [],
      imageWidth: 1,
      imageHeight: 1,
      originalImage: image,
      annotatedImage: image,
    });
    await markSketchesDispatching([{ id: document.id, revision: document.revision }], 11, "batch-11");

    resetSketchStore();
    await initializeSketchStore(projectId);

    expect(getSketches()[0]).toMatchObject({ status: "unknown", document: { id: document.id } });
    await requeueSketch(document.id);
    expect(getSketches()[0]?.status).toBe("pending");
  });
});
