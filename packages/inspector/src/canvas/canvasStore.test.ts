// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getCanvasMode,
  getCanvasCards,
  setCanvasMode,
  enterCanvas,
  exitCanvas,
  addCanvasCard,
  removeCanvasCard,
  updateCardTitle,
  updateCardUrl,
  subscribe,
  type CanvasMode,
} from "./canvasStore.ts";

describe("canvasStore mode transitions", () => {
  beforeEach(() => {
    // Reset to inspect mode
    if (getCanvasMode() === "canvas") exitCanvas();
  });

  it("starts in inspect mode", () => {
    expect(getCanvasMode()).toBe("inspect");
  });

  it("enterCanvas transitions to canvas mode and creates an initial card", () => {
    enterCanvas();
    expect(getCanvasMode()).toBe("canvas");
    const cards = getCanvasCards();
    expect(cards.length).toBe(1);
    expect(cards[0]!.url).toBe(window.location.href);
  });

  it("exitCanvas returns to inspect mode without clearing cards", () => {
    enterCanvas();
    const cards = getCanvasCards();
    exitCanvas();
    expect(getCanvasMode()).toBe("inspect");
    expect(getCanvasCards()).toEqual(cards);
  });

  it("enterCanvas is idempotent for mode", () => {
    enterCanvas();
    const cards = getCanvasCards();
    enterCanvas();
    expect(getCanvasMode()).toBe("canvas");
    expect(getCanvasCards().length).toBe(cards.length);
  });

  it("exitCanvas is idempotent for mode", () => {
    enterCanvas();
    exitCanvas();
    exitCanvas();
    expect(getCanvasMode()).toBe("inspect");
  });

  it("setCanvasMode transitions to the requested mode", () => {
    setCanvasMode("canvas");
    expect(getCanvasMode()).toBe("canvas");
    setCanvasMode("inspect");
    expect(getCanvasMode()).toBe("inspect");
  });

  it("subscribe fires on mode change", () => {
    const received: CanvasMode[] = [];
    const unsub = subscribe(() => received.push(getCanvasMode()));
    enterCanvas();
    exitCanvas();
    expect(received).toEqual(["canvas", "inspect"]);
    unsub();
  });

  it("subscribe does not fire on no-op transitions", () => {
    let count = 0;
    const unsub = subscribe(() => count++);
    setCanvasMode("canvas");
    count = 0;
    setCanvasMode("canvas");
    expect(count).toBe(0);
    unsub();
  });
});

describe("canvasStore card operations", () => {
  beforeEach(() => {
    if (getCanvasMode() === "canvas") exitCanvas();
    for (const card of getCanvasCards()) {
      removeCanvasCard(card.id);
    }
  });

  it("addCanvasCard appends a card and notifies listeners", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    expect(card.id).toMatch(/^card-/);
    expect(card.url).toBe("http://localhost:5173/about");
    expect(card.title).toBe("About");
    expect(getCanvasCards()).toEqual([card]);
  });

  it("addCanvasCard with missing title stores null", () => {
    const card = addCanvasCard("http://localhost:5173/other");
    expect(card.title).toBeNull();
  });

  it("removeCanvasCard removes the card and notifies", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    removeCanvasCard(card.id);
    expect(getCanvasCards()).toEqual([]);
  });

  it("removeCanvasCard exits canvas when last card is removed", () => {
    enterCanvas();
    const cards = getCanvasCards();
    expect(getCanvasMode()).toBe("canvas");
    for (const card of cards) {
      removeCanvasCard(card.id);
    }
    expect(getCanvasMode()).toBe("inspect");
    expect(getCanvasCards()).toEqual([]);
  });

  it("removeCanvasCard no-ops for unknown id", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    removeCanvasCard("nonexistent");
    expect(getCanvasCards()).toEqual([card]);
  });

  it("updateCardTitle updates an existing card title and notifies", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    updateCardTitle(card.id, "Updated About");
    expect(getCanvasCards()[0]!.title).toBe("Updated About");
  });

  it("updateCardUrl updates an existing card url", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    updateCardUrl(card.id, "http://localhost:5173/other");
    expect(getCanvasCards()[0]!.url).toBe("http://localhost:5173/other");
  });

  it("subscribe fires on card changes", () => {
    const counts: number[] = [];
    let count = 0;
    const unsub = subscribe(() => counts.push(count++));

    addCanvasCard("http://localhost:5173/about", "About");
    const card = getCanvasCards()[0]!;
    updateCardTitle(card.id, "New Title");
    removeCanvasCard(card.id);

    expect(counts).toEqual([0, 1, 2]);
    unsub();
  });
});
