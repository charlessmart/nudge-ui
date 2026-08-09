// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  persistSession,
  hydrateSession,
  clearSession,
  serializeSession,
  storageKey,
  SCHEMA_VERSION,
  enableAutoSave,
  scheduleAutoSave,
  getRestoreCount,
  setRestoreCount,
  clearRestoreCount,
  resetAutoSave,
} from "./sessionStore.ts";
import { clearChanges, getChangesList, appendChange } from "../changesLog.ts";
import type { ComponentChangeRecord, ElementChangeRecord, TokenChangeRecord } from "../changesLog.ts";
import { makeComponentChange as makeComponentChangeRecord } from "../changes/_testUtils.ts";
import {
  getCanvasMode,
  getCanvasCards,
  getBoardCamera,
  setCanvasMode,
  enterCanvas,
  exitCanvas,
  addCanvasCard,
  removeCanvasCard as removeCanvasCardStore,
  setBoardCamera,
} from "./canvasStore.ts";
import { designToolProjectId } from "virtual:design-tokens";
import {
  createStructuralDelete,
  createStructuralMove,
  applyStructuralProjection,
  getStructuralChanges,
  resetStructuralDeleteProjection,
} from "../structuralProjection.ts";

function localUrl(path: string): string {
  return new URL(path, window.location.href).href;
}
import type { TokenEntry } from "virtual:design-tokens";

const COLOR_A: TokenEntry = { name: "--color-a", value: "#aaaaaa", source: "styles.css:1" };
const COLOR_B: TokenEntry = { name: "--color-b", value: "#bbbbbb", source: "styles.css:2" };

function makeElementChange(
  overrides: Partial<ElementChangeRecord> = {},
): ElementChangeRecord {
  return {
    cid: "Button",
    file: "src/Button.tsx",
    line: 1,
    selector: '[data-cid="Button"][data-src*="src/Button.tsx:1"]',
    property: "background",
    oldToken: COLOR_A,
    newToken: COLOR_B,
    source: { file: "src/Button.tsx", line: 1, component: "Button" },
    ...overrides,
  };
}

function makeTokenChange(
  overrides: Partial<TokenChangeRecord> = {},
): TokenChangeRecord {
  return {
    kind: "token",
    tokenName: "--color-surface-raised",
    file: "src/theme.css",
    line: 6,
    selector: ':root[data-theme="dark"]',
    property: "--color-surface-raised",
    rawValue: "#abcdef",
    oldRawValue: "#00ff00",
    context: { wrappers: [{ kind: "media", params: "(prefers-color-scheme: dark)" }] },
    contextLabel: 'root[data-theme="dark"]',
    source: { file: "src/theme.css", line: 6, component: "Global token" },
    ...overrides,
  };
}

function makeComponentChange(): ComponentChangeRecord {
  return makeComponentChangeRecord();
}

function resetAllState(): void {
  clearChanges();
  resetStructuralDeleteProjection();
  document.body.replaceChildren();
  if (getCanvasMode() === "canvas") exitCanvas();
  for (const card of getCanvasCards()) {
    removeCanvasCardStore(card.id);
  }
  setBoardCamera({ x: 0, y: 0, zoom: 1 });
  try {
    localStorage.removeItem(storageKey(designToolProjectId));
    localStorage.removeItem(`design-tool:${designToolProjectId}:v3`);
    localStorage.removeItem(`design-tool:${designToolProjectId}:v4`);
    localStorage.removeItem(`design-tool:${designToolProjectId}:v5`);
  } catch {
    // ignore
  }
  clearRestoreCount();
  resetAutoSave();
}

describe("sessionStore persistence", () => {
  beforeEach(resetAllState);
  afterEach(resetAllState);

  it("serializes and persists current changes", () => {
    appendChange(makeElementChange());
    persistSession();

    const raw = localStorage.getItem(storageKey(designToolProjectId));
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.projectId).toBe(designToolProjectId);
    expect(parsed.changes).toHaveLength(1);
    expect(parsed.changes[0].selector).toBe('[data-cid="Button"][data-src*="src/Button.tsx:1"]');
  });

  it("serializes a durable rendered-instance change", () => {
    appendChange(makeElementChange({
      scope: "rendered-instance",
      instanceOverride: {
        id: "override-1",
        target: {
          sourceSite: { cid: "Button", src: "src/Button.tsx:1:1" },
          locator: { kind: "evidence", occurrence: 1, props: null, text: "Two" },
        },
      },
    }));
    persistSession();

    const raw = localStorage.getItem(storageKey(designToolProjectId));
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.changes).toHaveLength(1);
    expect(parsed.changes[0]).toMatchObject({
      scope: "rendered-instance",
      instanceOverride: { id: "override-1", target: { locator: { occurrence: 1, text: "Two" } } },
    });
  });

  it("serializes canonical structural deletes and moves without document-local artefacts", () => {
    const parent = document.createElement("section");
    parent.dataset.cid = "List";
    parent.dataset.src = "src/List.tsx:4:1";
    const first = document.createElement("button");
    first.dataset.cid = "Item";
    first.dataset.src = "src/List.tsx:8:1";
    first.textContent = "First";
    const second = first.cloneNode(true) as HTMLElement;
    second.textContent = "Second";
    parent.append(first, second);
    document.body.append(parent);
    createStructuralDelete(second, "delete-1");
    createStructuralMove(first, { parent, before: null }, "move-1");

    const json = JSON.stringify(serializeSession());
    expect(json).toContain('"structuralChanges"');
    expect(json).toContain('"kind":"delete"');
    expect(json).toContain('"kind":"move"');
    expect(json).not.toContain("design-tool-deleted");
    expect(json).not.toContain("placeholder");
    expect(json).not.toContain("elementId");
  });

  it("serializes token changes without element identity fields", () => {
    appendChange(makeTokenChange());
    persistSession();

    const raw = localStorage.getItem(storageKey(designToolProjectId));
    const parsed = JSON.parse(raw!);
    expect(parsed.changes).toHaveLength(1);
    expect(parsed.changes[0].kind).toBe("token");
    expect(parsed.changes[0].rawValue).toBe("#abcdef");
    expect(parsed.changes[0].oldRawValue).toBe("#00ff00");
  });

  it("does not include preview results in serialized output", () => {
    appendChange(makeElementChange({ previewResult: { status: "applied", requestedValue: "var(--color-b)", computedValue: "#bbbbbb" } }));
    const session = serializeSession();
    const json = JSON.stringify(session);
    expect(json).not.toContain("previewResult");
    expect(json).not.toContain("computedValue");
  });

  it("serializes card and camera state", () => {
    setCanvasMode("canvas");
    const card = addCanvasCard(localUrl("/about"), "About");
    setBoardCamera({ x: 100, y: 200, zoom: 2 });
    persistSession();

    const raw = localStorage.getItem(storageKey(designToolProjectId));
    const parsed = JSON.parse(raw!);
    expect(parsed.mode).toBe("canvas");
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0].url).toBe(localUrl("/about"));
    expect(parsed.cards[0].title).toBe("About");
    expect(parsed.camera.x).toBe(100);
    expect(parsed.camera.y).toBe(200);
    expect(parsed.camera.zoom).toBe(2);
  });

  it("persists inspect mode state", () => {
    setCanvasMode("inspect");
    persistSession();

    const raw = localStorage.getItem(storageKey(designToolProjectId));
    const parsed = JSON.parse(raw!);
    expect(parsed.mode).toBe("inspect");
    expect(parsed.inspectUrl).toBe(window.location.href);
  });
});

describe("sessionStore hydration", () => {
  beforeEach(resetAllState);
  afterEach(resetAllState);

  it("hydrates changes back into the change log", () => {
    appendChange(makeElementChange());
    appendChange(makeTokenChange());
    persistSession();

    clearChanges();
    expect(getChangesList()).toHaveLength(0);

    const result = hydrateSession();
    expect(result.restored).toBe(true);
    expect(result.changeCount).toBe(2);
    expect(getChangesList()).toHaveLength(2);
  });

  it("hydrates structural changes without history and restores their document projection", () => {
    const target = document.createElement("button");
    target.dataset.cid = "Item";
    target.dataset.src = "src/List.tsx:8:1";
    target.textContent = "Second";
    document.body.append(target);
    createStructuralDelete(target, "delete-1");
    persistSession();

    resetStructuralDeleteProjection();
    document.body.replaceChildren(target);
    const result = hydrateSession();

    expect(result.changeCount).toBe(1);
    expect(getStructuralChanges()).toMatchObject([{ id: "delete-1", kind: "delete" }]);
    expect(target.isConnected).toBe(false);
  });

  it("migrates a v5 move to v6 presentation metadata before replaying it", () => {
    const parent = document.createElement("section");
    parent.dataset.cid = "List";
    parent.dataset.src = "src/List.tsx:4:1";
    const first = document.createElement("button");
    first.dataset.cid = "Item";
    first.dataset.src = "src/List.tsx:8:1";
    first.textContent = "First";
    const second = first.cloneNode(true) as HTMLElement;
    second.textContent = "Second";
    parent.append(first, second);
    document.body.append(parent);
    createStructuralMove(second, { parent, before: first }, "move-1");

    const legacy = JSON.parse(JSON.stringify(serializeSession())) as {
      schemaVersion: number;
      structuralChanges: Array<Record<string, unknown>>;
    };
    legacy.schemaVersion = 5;
    delete legacy.structuralChanges[0]!.presentation;
    localStorage.setItem(`design-tool:${designToolProjectId}:v5`, JSON.stringify(legacy));
    localStorage.removeItem(storageKey(designToolProjectId));

    resetStructuralDeleteProjection();
    const result = hydrateSession();

    expect(result).toMatchObject({ restored: true, changeCount: 1 });
    expect(getStructuralChanges()).toMatchObject([{
      id: "move-1",
      presentation: { parentTag: "section", fromIndex: 1, toIndex: 0 },
    }]);
    expect(Array.from(parent.children).map((element) => element.textContent)).toEqual(["Second", "First"]);
    expect(localStorage.getItem(`design-tool:${designToolProjectId}:v5`)).toBeNull();
    expect(localStorage.getItem(storageKey(designToolProjectId))).toContain('"schemaVersion":6');
  });

  it.each([3, 4, 5])("reads v%i durable CSS, drops legacy runtime records, and upgrades safely", (legacyVersion) => {
    const legacyKey = `design-tool:${designToolProjectId}:v${legacyVersion}`;
    localStorage.setItem(legacyKey, JSON.stringify({
      schemaVersion: legacyVersion,
      projectId: designToolProjectId,
      mode: "inspect",
      inspectUrl: window.location.href,
      cards: [],
      camera: { x: 0, y: 0, zoom: 1 },
      changes: [
        makeElementChange({ rawValue: "red", oldToken: null, newToken: null }),
        {
          ...makeElementChange({ rawValue: "blue", oldToken: null, newToken: null }),
          scope: "runtime-preview",
          elementId: "dt-instance-1",
        },
      ],
    }));

    const result = hydrateSession();

    expect(result).toMatchObject({ restored: true, changeCount: 1 });
    expect(getChangesList()).toHaveLength(1);
    expect(localStorage.getItem(legacyKey)).toBeNull();
    expect(localStorage.getItem(storageKey(designToolProjectId))).toContain('"schemaVersion":6');
  });

  it("rejects structural payloads with generated marker or document-local fields", () => {
    localStorage.setItem(storageKey(designToolProjectId), JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      projectId: designToolProjectId,
      mode: "inspect",
      inspectUrl: window.location.href,
      cards: [],
      camera: { x: 0, y: 0, zoom: 1 },
      changes: [],
      structuralChanges: [{
        id: "delete-1",
        kind: "delete",
        target: {
          sourceSite: { cid: "Item", src: "src/List.tsx:8:1" },
          locator: { kind: "evidence", occurrence: 0, props: null, text: "Second" },
        },
        marker: "data-dt-projection-instance",
      }],
    }));

    expect(hydrateSession()).toEqual({ restored: false, changeCount: 0 });
    expect(localStorage.getItem(storageKey(designToolProjectId))).toBeNull();
  });

  it("hydration creates no undo entries (loadChanges clears undo stack)", () => {
    appendChange(makeElementChange());
    persistSession();

    clearChanges();
    hydrateSession();

    expect(getChangesList()).toHaveLength(1);
  });

  it("hydrates canvas mode, cards, and camera", () => {
    setCanvasMode("canvas");
    const card = addCanvasCard(localUrl("/about"), "About");
    setBoardCamera({ x: 50, y: 100, zoom: 1.5 });
    persistSession();

    // Reset state
    exitCanvas();
    for (const c of getCanvasCards()) removeCanvasCardStore(c.id);
    setBoardCamera({ x: 0, y: 0, zoom: 1 });

    const result = hydrateSession();
    expect(result.restored).toBe(true);
    expect(getCanvasMode()).toBe("canvas");
    expect(getCanvasCards()).toHaveLength(1);
    expect(getCanvasCards()[0]!.url).toBe(localUrl("/about"));

    const camera = getBoardCamera();
    expect(camera.x).toBe(50);
    expect(camera.y).toBe(100);
    expect(camera.zoom).toBe(1.5);
  });

  it("hydrates inspect mode correctly", () => {
    setCanvasMode("inspect");
    persistSession();

    setCanvasMode("canvas");
    const result = hydrateSession();
    expect(result.restored).toBe(true);
    expect(getCanvasMode()).toBe("inspect");
  });

  it("returns no restoration when no session exists", () => {
    const result = hydrateSession();
    expect(result.restored).toBe(false);
    expect(result.changeCount).toBe(0);
  });

  it("returns no restoration for malformed JSON", () => {
    localStorage.setItem(storageKey(designToolProjectId), "not-valid-json{{");
    const result = hydrateSession();
    expect(result.restored).toBe(false);
    expect(localStorage.getItem(storageKey(designToolProjectId))).toBeNull();
  });

  it("returns no restoration for wrong schema version", () => {
    const session = JSON.stringify({
      schemaVersion: 999,
      projectId: designToolProjectId,
      mode: "inspect",
      cards: [],
      camera: { x: 0, y: 0, zoom: 1 },
      changes: [],
    });
    localStorage.setItem(storageKey(designToolProjectId), session);
    const result = hydrateSession();
    expect(result.restored).toBe(false);
  });

  it("returns no restoration for project ID mismatch", () => {
    const session = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      projectId: "wrong-project",
      mode: "inspect",
      cards: [],
      camera: { x: 0, y: 0, zoom: 1 },
      changes: [],
    });
    localStorage.setItem(storageKey(designToolProjectId), session);
    const result = hydrateSession();
    expect(result.restored).toBe(false);
  });

  it("returns no restoration for unknown mode", () => {
    const session = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      projectId: designToolProjectId,
      mode: "unknown",
      cards: [],
      camera: { x: 0, y: 0, zoom: 1 },
      changes: [],
    });
    localStorage.setItem(storageKey(designToolProjectId), session);
    const result = hydrateSession();
    expect(result.restored).toBe(false);
  });

  it("returns no restoration for malformed card data", () => {
    const session = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      projectId: designToolProjectId,
      mode: "canvas",
      cards: [{ id: 123, url: null }],
      camera: { x: 0, y: 0, zoom: 1 },
      changes: [],
    });
    localStorage.setItem(storageKey(designToolProjectId), session);
    const result = hydrateSession();
    expect(result.restored).toBe(false);
  });

  it("returns no restoration for malformed change data (missing selector)", () => {
    const session = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      projectId: designToolProjectId,
      mode: "inspect",
      cards: [],
      camera: { x: 0, y: 0, zoom: 1 },
      changes: [{ property: "color", source: { file: "x", line: 1, component: "X" } }],
    });
    localStorage.setItem(storageKey(designToolProjectId), session);
    const result = hydrateSession();
    expect(result.restored).toBe(false);
  });

  it("returns no restoration for bad camera data", () => {
    const session = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      projectId: designToolProjectId,
      mode: "inspect",
      cards: [],
      camera: { x: "not-a-number", y: 0, zoom: 1 },
      changes: [],
    });
    localStorage.setItem(storageKey(designToolProjectId), session);
    const result = hydrateSession();
    expect(result.restored).toBe(false);
  });

  it("hydrates cards with null titles", () => {
    setCanvasMode("canvas");
    const card = addCanvasCard(localUrl("/page"));
    persistSession();

    exitCanvas();
    for (const c of getCanvasCards()) removeCanvasCardStore(c.id);

    const result = hydrateSession();
    expect(result.restored).toBe(true);
    const cards = getCanvasCards();
    expect(cards).toHaveLength(1);
    expect(cards[0]!.title).toBeNull();
  });
});

describe("sessionStore clear session", () => {
  beforeEach(resetAllState);
  afterEach(resetAllState);

  it("removes localStorage entry", () => {
    appendChange(makeElementChange());
    persistSession();
    expect(localStorage.getItem(storageKey(designToolProjectId))).not.toBeNull();

    clearSession();
    expect(localStorage.getItem(storageKey(designToolProjectId))).toBeNull();
  });

  it("clears all changes from the log", () => {
    appendChange(makeElementChange());
    appendChange(makeTokenChange());
    expect(getChangesList()).toHaveLength(2);

    clearSession();
    expect(getChangesList()).toHaveLength(0);
  });

  it("clears structural projections, histories, and host previews", () => {
    const target = document.createElement("button");
    target.dataset.cid = "Item";
    target.dataset.src = "src/List.tsx:8:1";
    target.textContent = "Second";
    document.body.append(target);
    createStructuralDelete(target, "delete-1");
    applyStructuralProjection(document, getStructuralChanges());
    expect(target.isConnected).toBe(false);

    clearSession();

    expect(getStructuralChanges()).toEqual([]);
    expect(target.isConnected).toBe(true);
  });

  it("clears all canvas cards", () => {
    setCanvasMode("canvas");
    addCanvasCard(localUrl("/about"));
    expect(getCanvasCards().length).toBeGreaterThan(0);

    clearSession();
    expect(getCanvasCards()).toHaveLength(0);
  });

  it("resets camera to default", () => {
    setBoardCamera({ x: 100, y: 200, zoom: 3 });
    clearSession();
    const camera = getBoardCamera();
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);
    expect(camera.zoom).toBe(1);
  });
});

describe("sessionStore restore count", () => {
  beforeEach(resetAllState);
  afterEach(resetAllState);

  it("getRestoreCount starts at 0", () => {
    expect(getRestoreCount()).toBe(0);
  });

  it("setRestoreCount and getRestoreCount round-trip", () => {
    setRestoreCount(3);
    expect(getRestoreCount()).toBe(3);
  });

  it("clearRestoreCount resets to 0", () => {
    setRestoreCount(5);
    clearRestoreCount();
    expect(getRestoreCount()).toBe(0);
  });
});

describe("sessionStore auto-save", () => {
  beforeEach(resetAllState);
  afterEach(resetAllState);

  it("scheduleAutoSave persists when enabled (after the debounce window)", () => {
    vi.useFakeTimers();
    try {
      enableAutoSave();
      appendChange(makeElementChange());
      scheduleAutoSave();

      // The write is coalesced behind a trailing timer so commits never block
      // on serialization; it must land once the debounce window elapses.
      expect(localStorage.getItem(storageKey(designToolProjectId))).toBeNull();
      vi.advanceTimersByTime(600);
      expect(localStorage.getItem(storageKey(designToolProjectId))).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("scheduleAutoSave no-ops when not enabled", () => {
    // resetAllState already called resetAutoSave
    appendChange(makeElementChange());
    scheduleAutoSave();

    const raw = localStorage.getItem(storageKey(designToolProjectId));
    expect(raw).toBeNull();
  });

  it("flushes a first debounced edit on beforeunload", () => {
    vi.useFakeTimers();
    try {
      enableAutoSave();
      appendChange(makeElementChange());
      scheduleAutoSave();

      expect(localStorage.getItem(storageKey(designToolProjectId))).toBeNull();
      window.dispatchEvent(new Event("beforeunload"));
      expect(localStorage.getItem(storageKey(designToolProjectId))).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not overwrite an externally updated session when clean", () => {
    vi.useFakeTimers();
    try {
      enableAutoSave();
      appendChange(makeElementChange());
      scheduleAutoSave();
      vi.advanceTimersByTime(600);

      const externalSession = JSON.stringify({ source: "another-tab" });
      localStorage.setItem(storageKey(designToolProjectId), externalSession);
      window.dispatchEvent(new Event("beforeunload"));

      expect(localStorage.getItem(storageKey(designToolProjectId))).toBe(externalSession);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a pending autosave when the session is cleared", () => {
    vi.useFakeTimers();
    try {
      enableAutoSave();
      appendChange(makeElementChange());
      scheduleAutoSave();
      clearSession();
      vi.advanceTimersByTime(600);

      expect(localStorage.getItem(storageKey(designToolProjectId))).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("sessionStore round trip", () => {
  beforeEach(resetAllState);
  afterEach(resetAllState);

  it("full round-trip preserves element changes", () => {
    appendChange(makeElementChange());
    appendChange(makeElementChange({
      property: "color",
      newToken: null,
      oldToken: null,
      rawValue: "red",
    }));
    persistSession();

    clearChanges();
    hydrateSession();

    const restored = getChangesList();
    expect(restored).toHaveLength(2);
    expect(restored[0]!.property).toBe("background");
    expect(restored[1]!.property).toBe("color");
    expect((restored[1] as ElementChangeRecord).rawValue).toBe("red");
  });

  it("full round-trip preserves token changes", () => {
    appendChange(makeTokenChange());
    persistSession();

    clearChanges();
    hydrateSession();

    const restored = getChangesList();
    expect(restored).toHaveLength(1);
    expect(restored[0]!.kind).toBe("token");
    if (restored[0]!.kind === "token") {
      expect((restored[0] as TokenChangeRecord).rawValue).toBe("#abcdef");
    }
  });

  it("full round-trip preserves typed component prop changes", () => {
    appendChange(makeComponentChange());
    persistSession();

    clearChanges();
    hydrateSession();

    expect(getChangesList()).toMatchObject([{
      kind: "component-prop",
      target: { componentId: "src/ui/Button#Button" },
      before: { kind: "value", value: "primary" },
      after: "secondary",
      authoredAs: "literal",
    }]);
  });

  it("full round-trip preserves canvas state", () => {
    setCanvasMode("canvas");
    const card = addCanvasCard(localUrl("/page1"), "Page 1");
    addCanvasCard(localUrl("/page2"), "Page 2");
    setBoardCamera({ x: 42, y: 7, zoom: 0.5 });
    persistSession();

    exitCanvas();
    for (const c of getCanvasCards()) removeCanvasCardStore(c.id);
    setBoardCamera({ x: 0, y: 0, zoom: 1 });

    hydrateSession();

    const cards = getCanvasCards();
    expect(cards).toHaveLength(2);
    expect(getCanvasMode()).toBe("canvas");
    const camera = getBoardCamera();
    expect(camera.x).toBe(42);
    expect(camera.y).toBe(7);
    expect(camera.zoom).toBe(0.5);
  });
});

describe("sessionStore exclusions", () => {
  beforeEach(resetAllState);
  afterEach(resetAllState);

  it("does not persist undo/redo stacks", () => {
    appendChange(makeElementChange());
    appendChange(makeElementChange({ property: "color", rawValue: "red" }));
    persistSession();

    const raw = localStorage.getItem(storageKey(designToolProjectId));
    const parsed = JSON.parse(raw!);
    expect(parsed.undoStack).toBeUndefined();
    expect(parsed.redoStack).toBeUndefined();
  });

  it("does not persist selection state", () => {
    appendChange(makeElementChange());
    persistSession();

    const raw = localStorage.getItem(storageKey(designToolProjectId));
    const parsed = JSON.parse(raw!);
    expect(parsed.selection).toBeUndefined();
    expect(parsed.selectedElement).toBeUndefined();
  });

  it("does not persist preview verification results", () => {
    appendChange(makeElementChange({
      previewResult: {
        status: "applied",
        requestedValue: "var(--color-b)",
        computedValue: "#bbbbbb",
      },
    }));
    persistSession();

    const raw = localStorage.getItem(storageKey(designToolProjectId));
    expect(raw).not.toContain("previewResult");
    expect(raw).not.toContain("computedValue");
  });
});
