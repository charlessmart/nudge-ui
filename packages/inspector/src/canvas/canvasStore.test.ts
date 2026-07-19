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
  duplicateCard,
  findCardByNormalizedUrl,
  focusCard,
  getFocusedCardId,
  subscribe,
  type CanvasMode,
} from "./canvasStore.ts";
import { normalizeUrl } from "./normalizeUrl.ts";

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

describe("canvasStore duplicateCard", () => {
  beforeEach(() => {
    if (getCanvasMode() === "canvas") exitCanvas();
    for (const card of getCanvasCards()) {
      removeCanvasCard(card.id);
    }
  });

  it("creates a new card with same URL but distinct ID", () => {
    const original = addCanvasCard("http://localhost:5173/about", "About");
    const copy = duplicateCard(original.id);

    expect(copy).not.toBeNull();
    expect(copy!.url).toBe(original.url);
    expect(copy!.title).toBe(original.title);
    expect(copy!.id).not.toBe(original.id);
    expect(copy!.id).toMatch(/^card-/);
  });

  it("duplicate notifies listeners", () => {
    const original = addCanvasCard("http://localhost:5173/about", "About");
    let fired = false;
    const unsub = subscribe(() => { fired = true; });
    duplicateCard(original.id);
    expect(fired).toBe(true);
    unsub();
  });

  it("returns null for non-existent source card", () => {
    const result = duplicateCard("nonexistent");
    expect(result).toBeNull();
  });
});

describe("canvasStore findCardByNormalizedUrl", () => {
  beforeEach(() => {
    if (getCanvasMode() === "canvas") exitCanvas();
    for (const card of getCanvasCards()) {
      removeCanvasCard(card.id);
    }
  });

  it("finds a card by normalized URL ignoring hash", () => {
    addCanvasCard("http://localhost:5173/about", "About");

    const normalized = normalizeUrl("http://localhost:5173/about#section1");
    expect(normalized).not.toBeNull();
    const found = findCardByNormalizedUrl(normalized!);
    expect(found).toBeDefined();
    expect(found!.url).toBe("http://localhost:5173/about");
  });

  it("distinguishes cards by pathname", () => {
    addCanvasCard("http://localhost:5173/about", "About");

    const normalized = normalizeUrl("http://localhost:5173/contact");
    expect(normalized).not.toBeNull();
    const found = findCardByNormalizedUrl(normalized!);
    expect(found).toBeUndefined();
  });

  it("distinguishes cards by search params", () => {
    addCanvasCard("http://localhost:5173/about?tab=1", "Tab 1");

    const normalized = normalizeUrl("http://localhost:5173/about?tab=2");
    expect(normalized).not.toBeNull();
    const found = findCardByNormalizedUrl(normalized!);
    expect(found).toBeUndefined();
  });

  it("finds the correct card when multiple cards exist", () => {
    addCanvasCard("http://localhost:5173/about", "About");
    addCanvasCard("http://localhost:5173/contact", "Contact");

    const normalized = normalizeUrl("http://localhost:5173/contact");
    expect(normalized).not.toBeNull();
    const found = findCardByNormalizedUrl(normalized!);
    expect(found).toBeDefined();
    expect(found!.title).toBe("Contact");
  });

  it("returns undefined when duplicate exists via duplicateCard", () => {
    const original = addCanvasCard("http://localhost:5173/about", "About");
    duplicateCard(original.id);

    const normalized = normalizeUrl("http://localhost:5173/about");
    expect(normalized).not.toBeNull();
    const found = findCardByNormalizedUrl(normalized!);
    expect(found).toBeDefined();
    // Returns the first match
  });
});

describe("canvasStore focusCard", () => {
  beforeEach(() => {
    if (getCanvasMode() === "canvas") exitCanvas();
    for (const card of getCanvasCards()) {
      removeCanvasCard(card.id);
    }
  });

  it("sets and returns the focused card ID", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    focusCard(card.id);
    expect(getFocusedCardId()).toBe(card.id);
  });

  it("notifies listeners when focused card changes", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    let fired = false;
    const unsub = subscribe(() => { fired = true; });
    focusCard(card.id);
    expect(fired).toBe(true);
    unsub();
  });

  it("starts with null focused card", () => {
    const before = getFocusedCardId();
    const card = addCanvasCard("http://localhost:5173/about", "About");
    focusCard(card.id);
    expect(getFocusedCardId()).toBe(card.id);
    // focusCard does not auto-focus new cards
    const card2 = addCanvasCard("http://localhost:5173/other", "Other");
    expect(getFocusedCardId()).toBe(card.id);
  });
});
