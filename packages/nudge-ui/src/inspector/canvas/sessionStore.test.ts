import { contentSourceUrl } from "./frameContent.ts";
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  persistSession,
  hydrateSession,
  clearSession,
  clearSelectedFrameChanges,
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
import { clearWorkspace, getChangesList, appendChange } from "../changes/changesLog.ts";
import type { ElementChangeRecord } from "../changes/changesLog.ts";
import {
  getCanvasMode,
  getCanvasCards,
  getBoardCamera,
  setCanvasMode,
  addCanvasCard,
  addCanvasVariation,
  duplicateCard,
  hydrateCanvasStore,
  appendLinkedGroupCards,
  setFrameGroup,
  getFrameGroups,
  setCanvasPresentation,
  getCanvasPresentation,
  removeCanvasCard as removeCanvasCardStore,
  setBoardCamera,
  focusCard,
  getFocusedCardId,
  resizeCard,
  selectCard,
} from "./canvasStore.ts";
import { activateDraftForCard, createStudyDraft, getWorkspaceForCard, initializeDrafts, resetDrafts } from "../drafts/store.ts";
import { nudgeUiProjectId } from "virtual:design-tokens";
import {
  createStructuralDelete,
  applyStructuralProjection,
  getStructuralChanges,
  resetStructuralDeleteProjection,
} from "../projection/structuralProjection.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import {
  clearClipboardHandoff,
  getClipboardHandoffSnapshot,
  recordClipboardHandoff,
} from "../prompt/clipboardHandoff.ts";

function localUrl(path: string): string {
  return new URL(path, window.location.href).href;
}
import type { TokenEntry } from "../../css/model/index.ts";

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

function resetAllState(): void {
  resetDrafts();
  localStorage.removeItem(`nudge-ui-drafts:${nudgeUiProjectId}:v1`);
  clearWorkspace();
  clearClipboardHandoff();
  resetStructuralDeleteProjection();
  document.body.replaceChildren();
  setCanvasMode("inspect");
  for (const card of getCanvasCards()) {
    removeCanvasCardStore(card.id);
  }
  setBoardCamera({ x: 0, y: 0, zoom: 1 });
  try {
    localStorage.removeItem(storageKey(nudgeUiProjectId));
    localStorage.removeItem(`nudge-ui:${nudgeUiProjectId}:v3`);
    localStorage.removeItem(`nudge-ui:${nudgeUiProjectId}:v${SCHEMA_VERSION - 1}`);
  } catch {
    // ignore
  }
  clearRestoreCount();
  resetAutoSave();
}

describe("sessionStore persistence", () => {
  beforeEach(resetAllState);
  afterEach(resetAllState);

  it("restores the linked frame membership and order", () => {
    const original = addCanvasCard(localUrl("/first"));
    const copy = duplicateCard(original.id)!;
    persistSession();
    hydrateCanvasStore("canvas", [], { x: 0, y: 0, zoom: 1 });
    expect(hydrateSession().restored).toBe(true);
    const restored = getCanvasCards();
    expect(restored.map((card) => card.id)).toEqual([original.id, copy.id]);
    expect(restored.map((card) => card.groupId)).toEqual([original.id, original.id]);
    expect(restored[1]!.x).toBeGreaterThan(restored[0]!.x + restored[0]!.width);
  });

  it("persists geometry and handoff metadata without duplicating draft intent", () => {
    appendChange(makeElementChange());
    persistSession();
    const parsed = JSON.parse(localStorage.getItem(storageKey(nudgeUiProjectId))!);
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.changes).toBeUndefined();
    expect(parsed.structuralChanges).toBeUndefined();
    expect(getChangesList()).toHaveLength(1);
  });

  it("persists the latest copied-prompt checkpoint with the durable session", () => {
    appendChange(makeElementChange());
    recordClipboardHandoff(getChangesList());
    persistSession();

    clearClipboardHandoff();
    clearWorkspace();
    expect(hydrateSession()).toMatchObject({ restored: true, changeCount: 0 });

    expect(getClipboardHandoffSnapshot()).toMatchObject({
      drafts: [{ owner: { target: { kind: "application" } }, changes: [{ key: expect.any(String), fingerprint: expect.any(String) }], structuralChanges: [] }],
    });
  });

  it("namespaces persistence with the configured standalone project identity", () => {
    const previousConfig = getNudgeUiRuntimeConfig();
    const standaloneProjectId = "static-html:standalone-fixture";
    try {
      configureNudgeUiRuntime({
        ...previousConfig,
        projectId: standaloneProjectId,
        host: "static-html",
        framework: "HTML",
        capabilities: { canvas: false, componentSemantics: false },
      });
      appendChange(makeElementChange());

      persistSession();

      expect(localStorage.getItem(storageKey(standaloneProjectId))).toContain(
        `"projectId":"${standaloneProjectId}"`,
      );
      expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toBeNull();
    } finally {
      localStorage.removeItem(storageKey(standaloneProjectId));
      configureNudgeUiRuntime(previousConfig);
    }
  });

  it("namespaces persistence with the configured nextjs project identity", () => {
    const previousConfig = getNudgeUiRuntimeConfig();
    const nextProjectId = "nextjs:9f2ab4c1";
    try {
      configureNudgeUiRuntime({
        ...previousConfig,
        projectId: nextProjectId,
        host: "nextjs-react",
        framework: "React",
        capabilities: { canvas: false, componentSemantics: false },
      });
      appendChange(makeElementChange());

      persistSession();

      expect(localStorage.getItem(storageKey(nextProjectId))).toContain(
        `"projectId":"${nextProjectId}"`,
      );
      // A Next.js session must neither read nor clobber Vite-host entries.
      expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toBeNull();
    } finally {
      localStorage.removeItem(storageKey(nextProjectId));
      configureNudgeUiRuntime(previousConfig);
    }
  });









  it("serializes card and camera state", () => {
    setCanvasMode("canvas");
    const card = addCanvasCard(localUrl("/about"), "About");
    resizeCard(card.id, 731, 509, { x: 24, y: 36 });
    focusCard(card.id);
    setBoardCamera({ x: 100, y: 200, zoom: 2 });
    persistSession();

    const raw = localStorage.getItem(storageKey(nudgeUiProjectId));
    const parsed = JSON.parse(raw!);
    expect(parsed.mode).toBe("canvas");
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0].content.url).toBe(localUrl("/about"));
    expect(parsed.cards[0].title).toBe("About");
    expect(parsed.cards[0]).toMatchObject({ x: 24, y: 36, width: 731, height: 509 });
    expect(parsed.camera.x).toBe(100);
    expect(parsed.camera.y).toBe(200);
    expect(parsed.camera.zoom).toBe(2);
    expect(parsed.focusedCardId).toBe(card.id);
  });

  it("persists inspect mode state", () => {
    setCanvasMode("inspect");
    persistSession();

    const raw = localStorage.getItem(storageKey(nudgeUiProjectId));
    const parsed = JSON.parse(raw!);
    expect(parsed.mode).toBe("inspect");
    expect(parsed.inspectUrl).toBe(window.location.href);
  });
});

describe("sessionStore hydration", () => {
  beforeEach(resetAllState);
  afterEach(resetAllState);

  it("restores the focused study from drafts after hydrating layout", () => {
    const original = addCanvasCard(localUrl("/first"));
    const artifactId = "550e8400-e29b-41d4-a716-446655440000";
    const study = addCanvasVariation(original.id, artifactId)!;
    initializeDrafts(nudgeUiProjectId, [original.id, study.id]);
    activateDraftForCard(original.id);
    appendChange(makeElementChange({ rawValue: "red" }));
    createStudyDraft(original.id, study.id, artifactId);
    activateDraftForCard(study.id);
    appendChange(makeElementChange({ rawValue: "blue" }));
    focusCard(study.id);
    persistSession();
    resetDrafts();
    clearWorkspace();
    hydrateCanvasStore("canvas", [], { x: 0, y: 0, zoom: 1 });

    expect(hydrateSession()).toEqual({ restored: true, changeCount: 0 });
    expect(getChangesList()).toEqual([]);
    initializeDrafts(nudgeUiProjectId, getCanvasCards().map((card) => card.id));
    activateDraftForCard(getFocusedCardId()!);

    expect(getChangesList()).toMatchObject([{ rawValue: "blue" }]);
    expect(getWorkspaceForCard(original.id)?.changes).toMatchObject([{ rawValue: "red" }]);
  });

  it("restores geometry without replacing the current draft's intent", () => {
    persistSession();
    appendChange(makeElementChange({ rawValue: "purple" }));
    expect(hydrateSession()).toEqual({ restored: true, changeCount: 0 });
    expect(getChangesList()).toMatchObject([{ rawValue: "purple" }]);
  });





  it("hydrates canvas mode, cards, and camera", () => {
    setCanvasMode("canvas");
    const card = addCanvasCard(localUrl("/about"), "About");
    resizeCard(card.id, 731, 509, { x: 24, y: 36 });
    focusCard(card.id);
    setBoardCamera({ x: 50, y: 100, zoom: 1.5 });
    persistSession();

    // Reset state
    setCanvasMode("inspect");
    for (const c of getCanvasCards()) removeCanvasCardStore(c.id);
    setBoardCamera({ x: 0, y: 0, zoom: 1 });

    const result = hydrateSession();
    expect(result.restored).toBe(true);
    expect(getCanvasMode()).toBe("canvas");
    expect(getCanvasCards()).toHaveLength(1);
    expect(contentSourceUrl(getCanvasCards()[0]!.content)).toBe(localUrl("/about"));
    expect(getCanvasCards()[0]).toMatchObject({ x: 24, y: 36, width: 731, height: 509 });
    expect(getFocusedCardId()).toBe(card.id);

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
    localStorage.setItem(storageKey(nudgeUiProjectId), "not-valid-json{{");
    const result = hydrateSession();
    expect(result.restored).toBe(false);
    expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toBeNull();
  });

  it.each([SCHEMA_VERSION - 1, SCHEMA_VERSION + 1])("discards unsupported schema version %i", (schemaVersion) => {
    const session = JSON.stringify({
      schemaVersion,
      projectId: nudgeUiProjectId,
      mode: "inspect",
      cards: [],
      camera: { x: 0, y: 0, zoom: 1 },
    });
    localStorage.setItem(storageKey(nudgeUiProjectId), session);
    const result = hydrateSession();
    expect(result.restored).toBe(false);
    expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toBeNull();
  });

  it.each(["cards", "camera", "clipboardHandoff"] as const)("discards a current session without %s", (field) => {
    const session = serializeSession() as unknown as Record<string, unknown>;
    delete session[field];
    localStorage.setItem(storageKey(nudgeUiProjectId), JSON.stringify(session));

    expect(hydrateSession()).toEqual({ restored: false, changeCount: 0 });
    expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toBeNull();
  });

  it("ignores legacy versioned keys instead of migrating them", () => {
    const legacyKey = `nudge-ui:${nudgeUiProjectId}:v${SCHEMA_VERSION - 1}`;
    const legacySession = serializeSession() as unknown as Record<string, unknown>;
    legacySession.schemaVersion = SCHEMA_VERSION - 1;
    localStorage.setItem(legacyKey, JSON.stringify(legacySession));

    expect(hydrateSession()).toEqual({ restored: false, changeCount: 0 });
    expect(localStorage.getItem(legacyKey)).not.toBeNull();
  });



  it("returns no restoration for project ID mismatch", () => {
    const session = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      projectId: "wrong-project",
      mode: "inspect",
      cards: [],
      camera: { x: 0, y: 0, zoom: 1 },
    });
    localStorage.setItem(storageKey(nudgeUiProjectId), session);
    const result = hydrateSession();
    expect(result.restored).toBe(false);
  });

  it("returns no restoration for unknown mode", () => {
    const session = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      projectId: nudgeUiProjectId,
      mode: "unknown",
      cards: [],
      camera: { x: 0, y: 0, zoom: 1 },
    });
    localStorage.setItem(storageKey(nudgeUiProjectId), session);
    const result = hydrateSession();
    expect(result.restored).toBe(false);
  });

  it("returns no restoration for malformed card data", () => {
    const session = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      projectId: nudgeUiProjectId,
      mode: "canvas",
      cards: [{ id: 123, url: null }],
      camera: { x: 0, y: 0, zoom: 1 },
    });
    localStorage.setItem(storageKey(nudgeUiProjectId), session);
    const result = hydrateSession();
    expect(result.restored).toBe(false);
  });






  it("returns no restoration for bad camera data", () => {
    const session = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      projectId: nudgeUiProjectId,
      mode: "inspect",
      cards: [],
      camera: { x: "not-a-number", y: 0, zoom: 1 },
    });
    localStorage.setItem(storageKey(nudgeUiProjectId), session);
    const result = hydrateSession();
    expect(result.restored).toBe(false);
  });

  it("hydrates cards with null titles", () => {
    setCanvasMode("canvas");
    const card = addCanvasCard(localUrl("/page"));
    persistSession();

    setCanvasMode("inspect");
    for (const c of getCanvasCards()) removeCanvasCardStore(c.id);

    const result = hydrateSession();
    expect(result.restored).toBe(true);
    const cards = getCanvasCards();
    expect(cards).toHaveLength(1);
    expect(cards[0]!.title).toBeNull();
  });

  it("round-trips agent-presented linked frames through the session", () => {
    setCanvasMode("canvas");
    setFrameGroup({ id: "agent-landing-iterations", kind: "agent", label: "Landing alternatives", agentId: "agent", routes: [{ url: localUrl("/landing-a") }, { url: localUrl("/landing-b") }] });
    appendLinkedGroupCards("agent-landing-iterations", [
      { url: localUrl("/landing-a"), title: "A" },
      { url: localUrl("/landing-b"), title: "B" },
    ]);
    persistSession();

    for (const card of getCanvasCards()) removeCanvasCardStore(card.id);
    hydrateCanvasStore("canvas", [], { x: 0, y: 0, zoom: 1 });
    hydrateSession();
    expect(getFrameGroups()).toMatchObject([{ id: "agent-landing-iterations", kind: "agent", label: "Landing alternatives", agentId: "agent" }]);

    expect(getCanvasCards().map((card) => ({ url: contentSourceUrl(card.content), title: card.title, groupId: card.groupId })))
      .toEqual([
        { url: localUrl("/landing-a"), title: "A", groupId: "agent-landing-iterations" },
        { url: localUrl("/landing-b"), title: "B", groupId: "agent-landing-iterations" },
      ]);
  });
});

describe("sessionStore clear session", () => {
  beforeEach(resetAllState);
  afterEach(resetAllState);

  it("clears only the selected draft and preserves canvas geometry and other frame edits", () => {
    resetDrafts();
    const original = addCanvasCard(localUrl("/first"));
    const artifactId = "550e8400-e29b-41d4-a716-446655440000";
    const study = addCanvasVariation(original.id, artifactId)!;
    initializeDrafts(nudgeUiProjectId, [original.id, study.id]);
    activateDraftForCard(original.id);
    appendChange(makeElementChange({ rawValue: "red" }));
    createStudyDraft(original.id, study.id, artifactId);
    activateDraftForCard(study.id);
    appendChange(makeElementChange({ rawValue: "blue" }));
    selectCard(study.id);
    setBoardCamera({ x: 100, y: 200, zoom: 0.7 });
    const geometry = getCanvasCards();
    try {
      clearSelectedFrameChanges();
      expect(getWorkspaceForCard(study.id)?.changes).toEqual([]);
      expect(getWorkspaceForCard(original.id)?.changes[0]).toMatchObject({ rawValue: "red" });
      expect(getCanvasCards()).toEqual(geometry);
      expect(getBoardCamera()).toEqual({ x: 100, y: 200, zoom: 0.7 });
      persistSession();
      expect(localStorage.getItem(storageKey(nudgeUiProjectId))).not.toBeNull();
    } finally {
      resetDrafts();
    }
  });

  it("removes localStorage entry", () => {
    appendChange(makeElementChange());
    persistSession();
    expect(localStorage.getItem(storageKey(nudgeUiProjectId))).not.toBeNull();

    clearSession();
    expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toBeNull();
  });

  it("clears all changes from the log", () => {
    appendChange(makeElementChange());
    appendChange(makeElementChange({ property: "color", rawValue: "purple" }));
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
      expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toBeNull();
      vi.advanceTimersByTime(600);
      expect(localStorage.getItem(storageKey(nudgeUiProjectId))).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("scheduleAutoSave no-ops when not enabled", () => {
    // resetAllState already called resetAutoSave
    appendChange(makeElementChange());
    scheduleAutoSave();

    const raw = localStorage.getItem(storageKey(nudgeUiProjectId));
    expect(raw).toBeNull();
  });

  it("flushes a first debounced edit on beforeunload", () => {
    vi.useFakeTimers();
    try {
      enableAutoSave();
      appendChange(makeElementChange());
      scheduleAutoSave();

      expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toBeNull();
      window.dispatchEvent(new Event("beforeunload"));
      expect(localStorage.getItem(storageKey(nudgeUiProjectId))).not.toBeNull();
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
      localStorage.setItem(storageKey(nudgeUiProjectId), externalSession);
      window.dispatchEvent(new Event("beforeunload"));

      expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toBe(externalSession);
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

      expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("sessionStore round trip", () => {
  beforeEach(resetAllState);
  afterEach(resetAllState);






  it("full round-trip preserves canvas state", () => {
    setCanvasMode("canvas");
    const card = addCanvasCard(localUrl("/page1"), "Page 1");
    addCanvasCard(localUrl("/page2"), "Page 2");
    setBoardCamera({ x: 42, y: 7, zoom: 0.5 });
    persistSession();

    setCanvasMode("inspect");
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

    const raw = localStorage.getItem(storageKey(nudgeUiProjectId));
    const parsed = JSON.parse(raw!);
    expect(parsed.undoStack).toBeUndefined();
    expect(parsed.redoStack).toBeUndefined();
  });

  it("does not persist selection state", () => {
    appendChange(makeElementChange());
    persistSession();

    const raw = localStorage.getItem(storageKey(nudgeUiProjectId));
    const parsed = JSON.parse(raw!);
    expect(parsed.selection).toBeUndefined();
    expect(parsed.selectedElement).toBeUndefined();
  });

  it("does not persist preview verification results", () => {
    appendChange(makeElementChange());
    persistSession();

    const raw = localStorage.getItem(storageKey(nudgeUiProjectId));
    expect(raw).not.toContain("previewResult");
    expect(raw).not.toContain("computedValue");
  });
});

it("restores the canvas presentation and preserves the camera when returning from Focus", () => {
  addCanvasCard(localUrl("/page"));
  setCanvasPresentation("canvas");
  const camera = { x: 320, y: -80, zoom: 0.7 };
  setBoardCamera(camera);
  persistSession();
  hydrateCanvasStore("canvas", [], { x: 0, y: 0, zoom: 1 });
  expect(hydrateSession().restored).toBe(true);
  expect(getCanvasPresentation()).toBe("canvas");
  setCanvasPresentation("focus");
  setCanvasPresentation("canvas");
  expect(getBoardCamera()).toEqual(camera);
  resetAllState();
});
