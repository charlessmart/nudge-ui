// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { addCanvasCard, getCanvasCards, hydrateCanvasStore, addCanvasIteration, findCardByNormalizedUrl, activateIframeWorkspace, updateCardUrl } from "./canvasStore.ts";
import { clearSessionUndoHistory, resetDraftChanges } from "../changes/draftChanges.ts";
import { normalizeUrl } from "./normalizeUrl.ts";

beforeEach(() => { hydrateCanvasStore("canvas", [], { x: 0, y: 0, zoom: 1 }); resetDraftChanges(); clearSessionUndoHistory(); });

it("does not mistake an HTML iteration for a live route", () => {
  const source = addCanvasCard(new URL("/", window.location.origin).href);
  addCanvasIteration(source.id, "iteration-id");
  expect(findCardByNormalizedUrl(normalizeUrl(new URL("/", window.location.origin).href)!)).toMatchObject({ id: source.id });
});

it("preserves restored iteration focus at startup and targets live frames for explicit navigation", () => {
  const live = addCanvasCard(new URL("/", window.location.origin).href);
  const iteration = addCanvasIteration(live.id, "iteration-id")!;
  hydrateCanvasStore("canvas", getCanvasCards(), { x: 0, y: 0, zoom: 1 }, iteration.id);
  expect(activateIframeWorkspace(new URL("/", window.location.origin).href, { width: 800, height: 600 }, { preserveIterationFocus: true })?.id).toBe(iteration.id);
  expect(activateIframeWorkspace(new URL("/", window.location.origin).href, { width: 800, height: 600 })?.id).toBe(live.id);
  updateCardUrl(iteration.id, new URL("/another", window.location.origin).href);
  expect(getCanvasCards().find((card) => card.id === iteration.id)?.content).toEqual(iteration.content);
});
