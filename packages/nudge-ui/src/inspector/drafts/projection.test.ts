// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activateIframeWorkspace, addCanvasIteration, hydrateCanvasStore } from "../canvas/canvasStore.ts";
import { computeProjectionForCard, resetProjectionRevision, registerCardFrame, unregisterCardFrame, sendProjectionToCard, projectDraftToDocument, projectToAllReadyCards, recordCanvasProjectionApplied, getCanonicalFrameProjection } from "../canvas/projection.ts";
import { draftChangeStore } from "../changes/draftChanges.ts";
import type { TextContentChangeRecord } from "../changes/types.ts";
import { getTextContentChangeDiagnostics, recordCanvasTextProjectionReports, resetTextProjectionState } from "../projection/textProjection.ts";
import { loadDrafts, activateDraftForCard, getDraftForCard, assignSketchToDraft, sketchBelongsToCard, resetDrafts } from "./store.ts";
import type { SketchDocument } from "../sketch/model.ts";

const artifactId = "550e8400-e29b-41d4-a716-446655440000";
function text(id: string): TextContentChangeRecord {
  return {
    kind: "text-content", id, selector: '[data-cid="Heading"]',
    target: { sourceSite: { cid: "Heading", src: "src/Heading.tsx:1:1" }, occurrence: 0, props: null, ariaLabel: null, beforeText: "Before" },
    source: { file: "src/Heading.tsx", line: 1, column: 1, component: "Heading" },
    before: "Before", after: id, authoredAs: "literal",
  };
}

beforeEach(() => {
  document.documentElement.setAttribute("data-nudge-ui-editor", "");
  resetDrafts(); resetProjectionRevision(); resetTextProjectionState();
  hydrateCanvasStore("canvas", [], { x: 0, y: 0, zoom: 1 });
});
afterEach(() => {
  document.documentElement.removeAttribute("data-nudge-ui-editor");
  resetDrafts();
  resetTextProjectionState();
});

function frames() {
  const live = activateIframeWorkspace(window.location.href, { width: 800, height: 600 })!;
  loadDrafts("projection", { persistent: false });
  activateDraftForCard(live.id);
  draftChangeStore.commitChangeRecords([text("live-text")]);
  const iteration = addCanvasIteration(live.id, artifactId)!;
  return { live, iteration };
}

it("accepts an inactive iteration's reports against its own projection and shows them only for that draft", () => {
  const { live, iteration } = frames();
  activateDraftForCard(iteration.id);
  draftChangeStore.commitChangeRecords([text("iteration-text")]);
  const iterationPlan = computeProjectionForCard(iteration.id);
  activateDraftForCard(live.id);
  recordCanvasTextProjectionReports(iteration.id, iterationPlan.revision, [{ changeId: "iteration-text", status: "missing" }], iterationPlan);
  expect(getTextContentChangeDiagnostics("iteration-text")).toEqual([]);
  activateDraftForCard(iteration.id);
  expect(getTextContentChangeDiagnostics("iteration-text")).toMatchObject([{ status: "missing" }]);
  draftChangeStore.commitChangeRecords([{ ...text("iteration-text"), after: "Newer" }]);
  expect(getTextContentChangeDiagnostics("iteration-text")).toEqual([]);
});

it("keeps draft revisions and cached plans stable when changing selection", () => {
  const { live, iteration } = frames();
  const draft = getDraftForCard(live.id)!;
  const plan = computeProjectionForCard(live.id);
  activateDraftForCard(iteration.id);
  activateDraftForCard(live.id);
  expect(getDraftForCard(live.id)?.revision).toBe(draft.revision);
  expect(computeProjectionForCard(live.id)).toBe(plan);
});

it("starts a captured iteration without the source's sketches or pending edits", () => {
  const { live } = frames();
  // SAFETY: draft ownership reads only the sketch ID and capture URL.
  const note = { id: "captured-note", capture: { url: window.location.href } } as SketchDocument;
  assignSketchToDraft(getDraftForCard(live.id)!.id, note.id);
  const iteration = addCanvasIteration(live.id, "660e8400-e29b-41d4-a716-446655440000")!;
  expect(getDraftForCard(iteration.id)?.contents.changes).toEqual([]);
  expect(sketchBelongsToCard(note, live.id)).toBe(true);
  expect(sketchBelongsToCard(note, iteration.id)).toBe(false);
  expect(getDraftForCard(live.id)?.target).toMatchObject({ kind: "application", route: window.location.origin + "/" });
  expect(getDraftForCard(iteration.id)?.target.kind).toBe("html");
});

it("restores the owning draft with a newer renderer revision after a temporary projection", async () => {
  const { live } = frames();
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => undefined);
  registerCardFrame(live.id, iframe);
  try {
    sendProjectionToCard(live, iframe);
    const pending = projectDraftToDocument(doc, { changes: [], structuralChanges: [] });
    const temporary = postMessage.mock.calls.at(-1)![0];
    projectToAllReadyCards();
    const canonical = postMessage.mock.calls.at(-1)![0];
    recordCanvasProjectionApplied(live.id, canonical.revision);

    expect(canonical.revision).toBeGreaterThan(temporary.revision);
    expect(canonical.textContentChanges).toMatchObject([{ after: "live-text" }]);
    await expect(pending).resolves.toBeNull();
  } finally {
    unregisterCardFrame(live.id);
    iframe.remove();
    vi.restoreAllMocks();
  }
});

it("rejects old reports when a frame registers a replacement document with unchanged intent", () => {
  const { live } = frames();
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => undefined);
  registerCardFrame(live.id, iframe);
  try {
    sendProjectionToCard(live, iframe);
    const previous = computeProjectionForCard(live.id);
    const replacement = document.implementation.createHTMLDocument("replacement");
    vi.spyOn(iframe, "contentDocument", "get").mockReturnValue(replacement);
    expect(getCanonicalFrameProjection(live.id, previous.revision)).toBeNull();
    registerCardFrame(live.id, iframe);
    sendProjectionToCard(live, iframe);
    expect(getCanonicalFrameProjection(live.id, previous.revision)).toBeNull();
    expect(computeProjectionForCard(live.id).revision).toBeGreaterThan(previous.revision);
  } finally {
    unregisterCardFrame(live.id);
    iframe.remove();
    vi.restoreAllMocks();
  }
});
