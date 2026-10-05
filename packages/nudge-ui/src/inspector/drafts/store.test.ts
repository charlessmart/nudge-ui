// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadActiveDraftChanges } from "../changes/changesLog.ts";
import type { ElementChangeRecord } from "../changes/types.ts";
import { hydrateCanvasStore, type CanvasCard } from "../canvas/canvasStore.ts";
import type { SketchDocument } from "../sketch/model.ts";
import {
  activateDraftForCard,
  assignSketchToDraft,
  clearSavedIterationDraft,
  draftIdForCard,
  getDraftForCard,
  getDraftContentsForCard,
  loadDrafts,
  persistDrafts,
  resetDrafts,
  sketchBelongsToCard,
} from "./store.ts";

const ARTIFACT = "00000000-0000-4000-8000-000000000001";

function change(rawValue: string): ElementChangeRecord {
  return {
    cid: "Heading",
    file: "src/Heading.tsx",
    line: 2,
    selector: '[data-cid="Heading"]',
    property: "color",
    oldToken: null,
    newToken: null,
    oldRawValue: "black",
    rawValue,
    source: { file: "src/Heading.tsx", line: 2, component: "Heading" },
  };
}

function page(id: string, path: string): CanvasCard {
  return { id, content: { kind: "route", url: new URL(path, location.href).href }, title: null, x: 0, y: 0, width: 100, height: 100 };
}

function iteration(id: string, artifactId = ARTIFACT): CanvasCard {
  return { id, content: { kind: "iteration", artifactId, sourceUrl: location.href }, title: null, x: 0, y: 0, width: 100, height: 100 };
}

function sketch(id: string, path: string): SketchDocument {
  // SAFETY: draft ownership reads only the sketch ID and capture URL.
  return { id, capture: { url: new URL(path, location.href).href } } as SketchDocument;
}

function edit(cardId: string, rawValue: string): void {
  activateDraftForCard(cardId);
  loadActiveDraftChanges([change(rawValue)], []);
}

beforeEach(() => {
  localStorage.clear();
  resetDrafts();
  hydrateCanvasStore("canvas", [page("home", "/"), page("linked", "/"), page("about", "/about"), iteration("iteration")], { x: 0, y: 0, zoom: 1 });
  loadDrafts("project");
});

afterEach(() => {
  resetDrafts();
});

describe("draft identity", () => {
  it("shares one draft between frames that show the same page", () => {
    edit("home", "red");
    expect(draftIdForCard("linked")).toBe(draftIdForCard("home"));
    expect(getDraftContentsForCard("linked")?.changes).toMatchObject([{ rawValue: "red" }]);
  });

  it("keeps page and iteration edits independent", () => {
    edit("home", "red");
    edit("about", "green");
    edit("iteration", "blue");
    expect(getDraftContentsForCard("home")?.changes).toMatchObject([{ rawValue: "red" }]);
    expect(getDraftContentsForCard("about")?.changes).toMatchObject([{ rawValue: "green" }]);
    expect(getDraftContentsForCard("iteration")?.changes).toMatchObject([{ rawValue: "blue" }]);
  });
});

describe("draft persistence", () => {
  it("restores each draft from storage", () => {
    edit("home", "red");
    edit("iteration", "blue");
    persistDrafts();
    resetDrafts();

    loadDrafts("project");
    expect(getDraftContentsForCard("home")?.changes).toMatchObject([{ rawValue: "red" }]);
    expect(getDraftContentsForCard("iteration")?.changes).toMatchObject([{ rawValue: "blue" }]);
  });

  it("replaces in-memory drafts with stored drafts when reloaded for the same project", () => {
    edit("home", "stale");
    localStorage.clear();

    loadDrafts("project");
    expect(getDraftContentsForCard("home")?.changes).toEqual([]);
  });

  it("omits empty drafts from storage", () => {
    activateDraftForCard("about");
    edit("home", "red");
    persistDrafts();
    const stored = JSON.parse(localStorage.getItem("nudge-ui-drafts:project:v2")!);
    expect(stored.drafts).toHaveLength(1);
  });

  it("keeps demo drafts in memory without reading or replacing saved project drafts", () => {
    const key = "nudge-ui-drafts:project:v2";
    localStorage.setItem(key, "saved development workspace");
    loadDrafts("project", { persistent: false });
    edit("home", "purple");
    persistDrafts();
    expect(getDraftContentsForCard("home")?.changes).toMatchObject([{ rawValue: "purple" }]);
    expect(localStorage.getItem(key)).toBe("saved development workspace");
  });

  it.each(["invalid-record", "duplicate-target", "invalid-sketch-owner"])("discards malformed draft persistence: %s", (failure) => {
    edit("home", "red");
    persistDrafts();
    const key = "nudge-ui-drafts:project:v2";
    const stored = JSON.parse(localStorage.getItem(key)!);
    if (failure === "invalid-record") stored.drafts[0].contents.changes = [{ kind: "component-prop", target: null }];
    if (failure === "duplicate-target") stored.drafts.push(stored.drafts[0]);
    if (failure === "invalid-sketch-owner") stored.sketchOwners = { sketch: "draft-1" };
    localStorage.setItem(key, JSON.stringify(stored));

    loadDrafts("project");
    expect(getDraftContentsForCard("home")).toEqual({ changes: [], structuralChanges: [] });
  });
});

it("keeps newer intent when a save tries to clear an older draft revision", () => {
  edit("home", "red");
  const saved = getDraftForCard("home")!;
  loadActiveDraftChanges([change("blue")], []);
  expect(clearSavedIterationDraft("home", saved.revision)).toBe(false);
  expect(getDraftContentsForCard("home")?.changes).toMatchObject([{ rawValue: "blue" }]);
});

describe("sketch ownership", () => {
  it("assigns a sketch without an owner to the page it was captured on", () => {
    expect(sketchBelongsToCard(sketch("about-sketch", "/about"), "about")).toBe(true);
    expect(sketchBelongsToCard(sketch("about-sketch", "/about"), "home")).toBe(false);
  });

  it("assigns a sketch captured on an iteration preview to that iteration", () => {
    const document = sketch("iteration-sketch", `/__nudge_ui__/artifacts/${ARTIFACT}/preview`);
    expect(sketchBelongsToCard(document, "iteration")).toBe(true);
    expect(sketchBelongsToCard(document, "home")).toBe(false);
  });

  it("keeps an explicitly assigned sketch on one draft", () => {
    const document = sketch("sketch", "/");
    assignSketchToDraft(draftIdForCard("iteration")!, document.id);
    expect(sketchBelongsToCard(document, "iteration")).toBe(true);
    expect(sketchBelongsToCard(document, "home")).toBe(false);
  });
});
