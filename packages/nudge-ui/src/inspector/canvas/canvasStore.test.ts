// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getCanvasMode,
  getCanvasCards,
  setCanvasMode,
  addCanvasCard,
  removeCanvasCard,
  updateCardTitle,
  updateCardUrl,
  duplicateCard,
  findCardByNormalizedUrl,
  focusCard,
  getFocusedCardId,
  selectCard,
  deselectCard,
  getSelectedCardId,
  hydrateCanvasStore,
  resizeCard,
  getBoardCamera,
  setBoardCamera,
  fitAllCards,
  hasFitAllRan,
  resetFitAllFlag,
  MIN_CAMERA_ZOOM,
  MAX_CAMERA_ZOOM,
  subscribe,
  activateIframeWorkspace,
  PRIMARY_CARD_INSET,
  type CanvasMode,
} from "./canvasStore.ts";
import { normalizeUrl } from "./normalizeUrl.ts";

function resetAllCards(): void {
  setCanvasMode("inspect");
  resetFitAllFlag();
  for (const card of getCanvasCards()) {
    removeCanvasCard(card.id);
  }
}

function resetCameraToDefault(): void {
  setBoardCamera({ x: 0, y: 0, zoom: 1 });
}

describe("canvasStore mode transitions", () => {
  beforeEach(resetAllCards);

  it("starts in inspect mode", () => {
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
    setCanvasMode("canvas");
    setCanvasMode("inspect");
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
  beforeEach(resetAllCards);

  it("addCanvasCard appends a card with position and notifies listeners", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    expect(card.id).toMatch(/^card-/);
    expect(card.url).toBe("http://localhost:5173/about");
    expect(card.title).toBe("About");
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.y).toBeGreaterThanOrEqual(0);
    expect(card.width).toBeGreaterThan(0);
    expect(card.height).toBeGreaterThan(0);
    expect(getCanvasCards()).toHaveLength(1);
  });

  it("addCanvasCard with missing title stores null", () => {
    const card = addCanvasCard("http://localhost:5173/other");
    expect(card.title).toBeNull();
  });

  it("new cards are placed to the right of existing cards", () => {
    const a = addCanvasCard("http://localhost:5173/about", "About");
    const b = addCanvasCard("http://localhost:5173/contact", "Contact");
    const cards = getCanvasCards();
    const cardA = cards.find((c) => c.id === a.id)!;
    const cardB = cards.find((c) => c.id === b.id)!;
    expect(cardB.x).toBeGreaterThanOrEqual(cardA.x + cardA.width);
    expect(cardB.y).toBe(cardA.y);
  });

  it("new cards inherit the most recently used card size", () => {
    const first = addCanvasCard("http://localhost:5173/about", "About");
    resizeCard(first.id, 500, 400);
    const second = addCanvasCard("http://localhost:5173/contact", "Contact");
    const cards = getCanvasCards();
    const cardB = cards.find((c) => c.id === second.id)!;
    expect(cardB.width).toBe(500);
    expect(cardB.height).toBe(400);
  });

  it("duplicateCard inherits most recently used card size", () => {
    const first = addCanvasCard("http://localhost:5173/about", "About");
    resizeCard(first.id, 600, 450);
    const copy = duplicateCard(first.id);
    expect(copy).not.toBeNull();
    expect(copy!.width).toBe(600);
    expect(copy!.height).toBe(450);
  });

  it("removeCanvasCard removes the card and notifies", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    removeCanvasCard(card.id);
    expect(getCanvasCards()).toEqual([]);
  });

  it("removeCanvasCard keeps the iframe workspace active when the last card is removed", () => {
    setCanvasMode("canvas");
    addCanvasCard("http://localhost:5173/about", "About");
    const cards = getCanvasCards();
    expect(getCanvasMode()).toBe("canvas");
    for (const card of cards) {
      removeCanvasCard(card.id);
    }
    expect(getCanvasMode()).toBe("canvas");
    expect(getCanvasCards()).toEqual([]);
  });

  it("removeCanvasCard no-ops for unknown id", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    removeCanvasCard("nonexistent");
    expect(getCanvasCards()).toHaveLength(1);
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

describe("iframe workspace startup", () => {
  beforeEach(() => {
    resetAllCards();
    resetCameraToDefault();
  });

  it("fits the first application card inside the measured board at 100 percent", () => {
    const card = activateIframeWorkspace(
      new URL("/playground", window.location.href).href,
      { width: 1200, height: 800 },
    );

    expect(card).toMatchObject({
      title: null,
      width: 1200 - PRIMARY_CARD_INSET * 2,
      height: 800 - PRIMARY_CARD_INSET * 2,
    });
    expect(getBoardCamera()).toEqual({
      x: PRIMARY_CARD_INSET,
      y: PRIMARY_CARD_INSET,
      zoom: 1,
    });
    expect(getFocusedCardId()).toBe(card?.id);
  });

  it("focuses a restored target without changing its size or camera", () => {
    const target = new URL("/playground", window.location.href).href;
    hydrateCanvasStore("inspect", [{
      id: "card-42",
      url: target,
      title: "Application title",
      x: 120,
      y: 80,
      width: 713,
      height: 509,
    }], { x: -91, y: 37, zoom: 0.75 });

    activateIframeWorkspace(target, { width: 1200, height: 800 });

    expect(getCanvasMode()).toBe("canvas");
    expect(getCanvasCards()[0]).toMatchObject({ width: 713, height: 509 });
    expect(getBoardCamera()).toEqual({ x: -91, y: 37, zoom: 0.75 });
    expect(getFocusedCardId()).toBe("card-42");
  });

  it("applies an explicit entry fragment to a restored route without duplicating it", () => {
    const target = new URL("/playground#before", window.location.href).href;
    hydrateCanvasStore("canvas", [{
      id: "card-42", url: target, title: null,
      x: 0, y: 0, width: 713, height: 509,
    }], { x: 0, y: 0, zoom: 1 });

    const requested = new URL("/playground#requested", window.location.href).href;
    activateIframeWorkspace(requested, { width: 1200, height: 800 });

    expect(getCanvasCards()).toHaveLength(1);
    expect(getCanvasCards()[0]?.url).toBe(requested);
    expect(getFocusedCardId()).toBe("card-42");
  });

  it("adds and focuses a new editor target without removing restored cards", () => {
    const restored = addCanvasCard(new URL("/first", window.location.href).href, "First");
    resizeCard(restored.id, 640, 480);
    const next = activateIframeWorkspace(
      new URL("/second", window.location.href).href,
      { width: 1200, height: 800 },
    );

    expect(getCanvasCards()).toHaveLength(2);
    expect(getCanvasCards()[0]).toMatchObject({ id: restored.id, width: 640, height: 480 });
    expect(next).toMatchObject({ width: 640, height: 480 });
    expect(getFocusedCardId()).toBe(next?.id);
  });
});

describe("canvasStore duplicateCard", () => {
  beforeEach(resetAllCards);

  it("creates a new card with same URL but distinct ID and position", () => {
    const original = addCanvasCard("http://localhost:5173/about", "About");
    const copy = duplicateCard(original.id);

    expect(copy).not.toBeNull();
    expect(copy!.url).toBe(original.url);
    expect(copy!.title).toBe(original.title);
    expect(copy!.id).not.toBe(original.id);
    expect(copy!.id).toMatch(/^card-/);
    const cards = getCanvasCards();
    const origInStore = cards.find((c) => c.id === original.id)!;
    expect(copy!.x).toBeGreaterThanOrEqual(origInStore.x + origInStore.width);
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
  beforeEach(resetAllCards);

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

  it("returns first match when duplicate exists via duplicateCard", () => {
    const original = addCanvasCard("http://localhost:5173/about", "About");
    duplicateCard(original.id);

    const normalized = normalizeUrl("http://localhost:5173/about");
    expect(normalized).not.toBeNull();
    const found = findCardByNormalizedUrl(normalized!);
    expect(found).toBeDefined();
  });
});

describe("canvasStore focusCard", () => {
  beforeEach(resetAllCards);

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

  it("adding a card keeps the focused card unchanged", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    focusCard(card.id);
    expect(getFocusedCardId()).toBe(card.id);
    const card2 = addCanvasCard("http://localhost:5173/other", "Other");
    expect(getFocusedCardId()).toBe(card.id);
  });
});

describe("canvasStore resizeCard", () => {
  beforeEach(resetAllCards);

  it("updates a card's width and height", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    resizeCard(card.id, 800, 600);
    const updated = getCanvasCards()[0]!;
    expect(updated.width).toBe(800);
    expect(updated.height).toBe(600);
  });

  it("does not modify other card properties", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    resizeCard(card.id, 800, 600);
    const updated = getCanvasCards()[0]!;
    expect(updated.id).toBe(card.id);
    expect(updated.url).toBe(card.url);
    expect(updated.title).toBe(card.title);
    expect(updated.x).toBe(card.x);
    expect(updated.y).toBe(card.y);
  });



  it("notifies listeners on resize", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    let fired = false;
    const unsub = subscribe(() => { fired = true; });
    resizeCard(card.id, 500, 400);
    expect(fired).toBe(true);
    unsub();
  });

  it("no-ops for unknown card id (no change)", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    resizeCard("nonexistent", 999, 999);
    const cards = getCanvasCards();
    expect(cards[0]!.width).toBe(card.width);
    expect(cards[0]!.height).toBe(card.height);
  });
});

describe("canvasStore camera", () => {
  beforeEach(() => {
    resetAllCards();
    resetCameraToDefault();
  });

  it("returns default camera initially", () => {
    const camera = getBoardCamera();
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);
    expect(camera.zoom).toBe(1);
  });

  it("setBoardCamera updates camera state", () => {
    setBoardCamera({ x: 100, y: 200, zoom: 1.5 });
    const camera = getBoardCamera();
    expect(camera.x).toBe(100);
    expect(camera.y).toBe(200);
    expect(camera.zoom).toBe(1.5);
  });

  it("setBoardCamera clamps zoom to MIN_CAMERA_ZOOM", () => {
    setBoardCamera({ x: 0, y: 0, zoom: 0.01 });
    expect(MIN_CAMERA_ZOOM).toBe(0.25);
    expect(getBoardCamera().zoom).toBe(MIN_CAMERA_ZOOM);
  });

  it("setBoardCamera clamps zoom to MAX_CAMERA_ZOOM", () => {
    setBoardCamera({ x: 0, y: 0, zoom: 999 });
    expect(getBoardCamera().zoom).toBe(MAX_CAMERA_ZOOM);
  });

  it("notifies listeners on camera change", () => {
    let fired = false;
    const unsub = subscribe(() => { fired = true; });
    setBoardCamera({ x: 10, y: 20, zoom: 2 });
    expect(fired).toBe(true);
    unsub();
  });
});

describe("canvasStore fitAllCards", () => {
  beforeEach(() => {
    resetAllCards();
    resetCameraToDefault();
  });





  it("fits within an explicit board viewport and keeps zoom in range", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    resizeCard(card.id, 1200, 800);

    fitAllCards({ width: 640, height: 480 });

    const camera = getBoardCamera();
    expect(camera.zoom).toBeGreaterThanOrEqual(MIN_CAMERA_ZOOM);
    expect(camera.zoom).toBeLessThanOrEqual(MAX_CAMERA_ZOOM);
    expect(camera.x).toBeCloseTo(320 - 600 * camera.zoom);
    expect(camera.y).toBeCloseTo(240 - 400 * camera.zoom);
  });

  it("no-ops when no cards exist", () => {
    fitAllCards();
    const camera = getBoardCamera();
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);
    expect(camera.zoom).toBe(1);
  });

  it("notifies listeners when fit runs", () => {
    addCanvasCard("http://localhost:5173/about", "About");
    let fired = false;
    const unsub = subscribe(() => { fired = true; });
    fitAllCards();
    expect(fired).toBe(true);
    unsub();
  });

  it("marks fitAllRan as true after running", () => {
    addCanvasCard("http://localhost:5173/about", "About");
    expect(hasFitAllRan()).toBe(false);
    fitAllCards();
    expect(hasFitAllRan()).toBe(true);
  });
});

describe("canvasStore world coordinate card placement", () => {
  beforeEach(resetAllCards);



  it("subsequent cards are placed to the right with gap", () => {
    const a = addCanvasCard("http://localhost:5173/a", "A");
    resizeCard(a.id, 400, 300);

    const b = addCanvasCard("http://localhost:5173/b", "B");
    resizeCard(b.id, 500, 400);

    const cards = getCanvasCards();
    const cardA = cards.find((c) => c.id === a.id)!;
    const cardB = cards.find((c) => c.id === b.id)!;

    expect(cardB.x).toBeGreaterThanOrEqual(cardA.x + cardA.width);
    expect(cardB.y).toBe(cardA.y);

    const c = addCanvasCard("http://localhost:5173/c", "C");
    const allCards = getCanvasCards();
    const cardC = allCards.find((card) => card.id === c.id)!;
    const cardB2 = allCards.find((card) => card.id === b.id)!;
    expect(cardC.x).toBeGreaterThanOrEqual(cardB2.x + cardB2.width);
  });

  it("duplicated card is placed to the right of all existing cards", () => {
    const a = addCanvasCard("http://localhost:5173/a", "A");
    resizeCard(a.id, 400, 300);

    const b = addCanvasCard("http://localhost:5173/b", "B");
    resizeCard(b.id, 300, 300);

    const copy = duplicateCard(a.id);
    expect(copy).not.toBeNull();

    const cards = getCanvasCards();
    const cardB = cards.find((c) => c.id === b.id)!;
    expect(copy!.x).toBeGreaterThanOrEqual(cardB.x + cardB.width);
  });

  it("cards maintain stable positions regardless of card removal", () => {
    const a = addCanvasCard("http://localhost:5173/a", "A");
    resizeCard(a.id, 400, 300);
    const b = addCanvasCard("http://localhost:5173/b", "B");
    resizeCard(b.id, 400, 300);

    const before = getCanvasCards();
    const firstPos = { x: before.find((c) => c.id === a.id)!.x, y: before.find((c) => c.id === a.id)!.y };

    removeCanvasCard(b.id);

    const remaining = getCanvasCards()[0]!;
    expect(remaining.x).toBe(firstPos.x);
    expect(remaining.y).toBe(firstPos.y);
  });


});

describe("canvasStore coordinate conversion (resize at zoom)", () => {
  beforeEach(resetAllCards);



  it("resize allows dimensions below minimum at store level (UI enforces)", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    resizeCard(card.id, 400, 300);

    resizeCard(card.id, 190, 140);
    const updated = getCanvasCards()[0]!;
    expect(updated.width).toBe(190);
    expect(updated.height).toBe(140);
  });
});

describe("canvasStore card selection", () => {
  beforeEach(resetAllCards);

  it("starts with no selected card", () => {
    expect(getSelectedCardId()).toBeNull();
  });

  it("selectCard sets the selected card ID", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    selectCard(card.id);
    expect(getSelectedCardId()).toBe(card.id);
  });

  it("deselectCard clears the selected card ID", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    selectCard(card.id);
    deselectCard();
    expect(getSelectedCardId()).toBeNull();
  });

  it("selectCard notifies listeners", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    let fired = false;
    const unsub = subscribe(() => { fired = true; });
    selectCard(card.id);
    expect(fired).toBe(true);
    unsub();
  });

  it("deselectCard notifies listeners", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    selectCard(card.id);
    let fired = false;
    const unsub = subscribe(() => { fired = true; });
    deselectCard();
    expect(fired).toBe(true);
    unsub();
  });



  it("removes selection when selected card is removed", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    selectCard(card.id);
    removeCanvasCard(card.id);
    expect(getSelectedCardId()).toBeNull();
  });

  it("maintains selection when non-selected card is removed", () => {
    const cardA = addCanvasCard("http://localhost:5173/about", "About");
    const cardB = addCanvasCard("http://localhost:5173/contact", "Contact");
    selectCard(cardA.id);
    removeCanvasCard(cardB.id);
    expect(getSelectedCardId()).toBe(cardA.id);
  });

  it("selecting a different card replaces the selection", () => {
    const cardA = addCanvasCard("http://localhost:5173/about", "About");
    const cardB = addCanvasCard("http://localhost:5173/contact", "Contact");
    selectCard(cardA.id);
    selectCard(cardB.id);
    expect(getSelectedCardId()).toBe(cardB.id);
  });

  it("hydrateCanvasStore clears selection", () => {
    const card = addCanvasCard("http://localhost:5173/about", "About");
    selectCard(card.id);
    hydrateCanvasStore("canvas", [card], { x: 0, y: 0, zoom: 1 });
    expect(getSelectedCardId()).toBeNull();
  });
});
