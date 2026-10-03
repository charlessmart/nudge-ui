// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { addCanvasCard, addCanvasRouteGrid, getCanvasCards, getSelectedCardId, hydrateCanvasStore, addCanvasVariation, findCardByNormalizedUrl, activateIframeWorkspace, updateCardUrl } from "./canvasStore.ts";
import { clearSessionUndoHistory, workspaceChangeStore, resetWorkspaceChanges } from "../changes/workspaceChanges.ts";
import { normalizeUrl } from "./normalizeUrl.ts";

beforeEach(() => { hydrateCanvasStore("canvas", [], { x: 0, y: 0, zoom: 1 }); resetWorkspaceChanges(); clearSessionUndoHistory(); });
describe("page grid creation", () => {
  it("places selected routes below existing frames and undoes the entire grid together", () => {
    const source = addCanvasCard(new URL("/", window.location.origin).href);
    const position = { x: source.x, y: source.y };
    const grid = addCanvasRouteGrid(["/about", "/cart", "/products", "/contact"].map((path) => ({ url: new URL(path, window.location.origin).href })));
    expect(grid).toHaveLength(4);
    expect(grid[0]!.y).toBeGreaterThan(source.y + source.height);
    expect(grid[0]!.y).toBe(grid[1]!.y);
    expect(grid[2]!.y).toBeGreaterThan(grid[0]!.y);
    expect(getCanvasCards()[0]).toMatchObject(position);
    expect(getSelectedCardId()).toBe(grid[0]!.id);
    workspaceChangeStore.undoWorkspaceChange(); expect(getCanvasCards().map((card) => card.id)).toEqual([source.id]);
    workspaceChangeStore.redoWorkspaceChange(); expect(getCanvasCards().map((card) => card.id)).toEqual([source.id, ...grid.map((card) => card.id)]);
  });
  it("rejects a grid containing an off-origin route without partial placement", () => {
    expect(addCanvasRouteGrid([{ url: new URL("/", window.location.origin).href }, { url: "https://other.test/" }])).toEqual([]);
    expect(getCanvasCards()).toEqual([]);
  });
  it("does not mistake an HTML study for a live route", () => {
    const source = addCanvasCard(new URL("/", window.location.origin).href);
    addCanvasVariation(source.id, "study-id");
    expect(findCardByNormalizedUrl(normalizeUrl(new URL("/", window.location.origin).href)!)).toMatchObject({ id: source.id });
  });
});

it("preserves restored study focus at startup and targets live frames for explicit navigation", () => {
  const live = addCanvasCard(new URL("/", window.location.origin).href);
  const study = addCanvasVariation(live.id, "study-id")!;
  hydrateCanvasStore("canvas", getCanvasCards(), { x: 0, y: 0, zoom: 1 }, study.id);
  expect(activateIframeWorkspace(new URL("/", window.location.origin).href, { width: 800, height: 600 }, { preserveStudyFocus: true })?.id).toBe(study.id);
  expect(activateIframeWorkspace(new URL("/", window.location.origin).href, { width: 800, height: 600 })?.id).toBe(live.id);
  updateCardUrl(study.id, new URL("/another", window.location.origin).href);
  expect(getCanvasCards().find((card) => card.id === study.id)?.content).toEqual(study.content);
});
