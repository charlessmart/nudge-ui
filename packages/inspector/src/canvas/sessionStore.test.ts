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
import type { ComponentChangeRecord, ElementChangeRecord, TextContentChangeRecord, TokenChangeRecord } from "../changesLog.ts";
import { makeComponentChange as makeComponentChangeRecord } from "../changes/_testUtils.ts";
import {
  getCanvasMode,
  getCanvasCards,
  getBoardCamera,
  setCanvasMode,
  enterCanvas,
  exitCanvas,
  addCanvasCard,
  appendCanvasComparisonGroup,
  getCanvasComparisonGroups,
  removeCanvasCard as removeCanvasCardStore,
  setBoardCamera,
} from "./canvasStore.ts";
import { nudgeUiProjectId } from "virtual:design-tokens";
import {
  createStructuralDelete,
  createStructuralMove,
  applyStructuralProjection,
  getStructuralChanges,
  resetStructuralDeleteProjection,
} from "../structuralProjection.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtimeConfig.ts";

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

function makeTextChange(overrides: Partial<TextContentChangeRecord> = {}): TextContentChangeRecord {
  return {
    kind: "text-content",
    id: "text-1",
    target: {
      sourceSite: { cid: "Copy", src: "src/Copy.tsx:8:3" },
      occurrence: 0,
      props: "tone:muted",
      ariaLabel: null,
      beforeText: "Original",
    },
    source: { file: "src/Copy.tsx", line: 8, column: 3, component: "Copy" },
    selector: '[data-cid="Copy"][data-src*="src/Copy.tsx:8:3"]',
    before: "Original",
    after: "Updated",
    authoredAs: "literal",
    ...overrides,
  };
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
    localStorage.removeItem(storageKey(nudgeUiProjectId));
    localStorage.removeItem(`nudge-ui:${nudgeUiProjectId}:v3`);
    localStorage.removeItem(`nudge-ui:${nudgeUiProjectId}:v4`);
    localStorage.removeItem(`nudge-ui:${nudgeUiProjectId}:v5`);
    localStorage.removeItem(`nudge-ui:${nudgeUiProjectId}:v6`);
    localStorage.removeItem(`nudge-ui:${nudgeUiProjectId}:v7`);
    localStorage.removeItem(`nudge-ui:${nudgeUiProjectId}:v8`);
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

    const raw = localStorage.getItem(storageKey(nudgeUiProjectId));
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.projectId).toBe(nudgeUiProjectId);
    expect(parsed.changes).toHaveLength(1);
    expect(parsed.changes[0].selector).toBe('[data-cid="Button"][data-src*="src/Button.tsx:1"]');
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

    const raw = localStorage.getItem(storageKey(nudgeUiProjectId));
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.changes).toHaveLength(1);
    expect(parsed.changes[0]).toMatchObject({
      scope: "rendered-instance",
      instanceOverride: { id: "override-1", target: { locator: { occurrence: 1, text: "Two" } } },
    });
  });

  it("serializes and hydrates a durable rendered-text change", () => {
    const element = document.createElement("p");
    element.dataset.cid = "Copy";
    element.dataset.src = "src/Copy.tsx:8:3";
    element.dataset.cprops = "tone:muted";
    element.textContent = "Original";
    document.body.append(element);

    appendChange(makeTextChange());
    persistSession();
    const parsed = JSON.parse(localStorage.getItem(storageKey(nudgeUiProjectId))!);
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.changes[0]).toMatchObject({
      kind: "text-content",
      target: { sourceSite: { cid: "Copy", src: "src/Copy.tsx:8:3" }, beforeText: "Original" },
      before: "Original",
      after: "Updated",
    });

    clearChanges();
    document.body.replaceChildren(element);
    const result = hydrateSession();
    expect(result.restored).toBe(true);
    expect(getChangesList()).toMatchObject([{ kind: "text-content", after: "Updated" }]);
    expect(element.textContent).toBe("Updated");
  });

  it("round-trips the exact text-node path for mixed Canvas projections", () => {
    const element = document.createElement("button");
    element.dataset.cid = "Copy";
    element.dataset.src = "src/Copy.tsx:8:3";
    element.dataset.cprops = "tone:muted";
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.innerHTML = "<path d=\"M0 0h4v4H0z\" />";
    const label = document.createElement("span");
    label.textContent = "Original";
    element.append(icon, label);
    document.body.append(element);

    appendChange(makeTextChange({
      target: {
        ...makeTextChange().target,
        textNodePath: [1, 0],
      },
    }));
    persistSession();
    const parsed = JSON.parse(localStorage.getItem(storageKey(nudgeUiProjectId))!);
    expect(parsed.changes[0].target.textNodePath).toEqual([1, 0]);

    clearChanges();
    document.body.replaceChildren(element);
    hydrateSession();
    expect(element.querySelector("path")).not.toBeNull();
    expect(element.querySelector("span")?.textContent).toBe("Updated");
    expect(getChangesList()[0]).toMatchObject({ target: { textNodePath: [1, 0] } });
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
    expect(json).not.toContain("nudge-ui-deleted");
    expect(json).not.toContain("placeholder");
    expect(json).not.toContain("elementId");
  });

  it("serializes token changes without element identity fields", () => {
    appendChange(makeTokenChange());
    persistSession();

    const raw = localStorage.getItem(storageKey(nudgeUiProjectId));
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

    const raw = localStorage.getItem(storageKey(nudgeUiProjectId));
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

    const raw = localStorage.getItem(storageKey(nudgeUiProjectId));
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

  it("migrates a v5 move to the current presentation schema before replaying it", () => {
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
    delete legacy.structuralChanges[0]!.source;
    localStorage.setItem(`nudge-ui:${nudgeUiProjectId}:v5`, JSON.stringify(legacy));
    localStorage.removeItem(storageKey(nudgeUiProjectId));

    resetStructuralDeleteProjection();
    const result = hydrateSession();

    expect(result).toMatchObject({ restored: true, changeCount: 1 });
    expect(getStructuralChanges()).toMatchObject([{
      id: "move-1",
      source: { parent: { sourceSite: { cid: "List", src: "src/List.tsx:4:1" } } },
      presentation: { sourceParentTag: "section", destinationParentTag: "section", fromIndex: 1, toIndex: 0 },
    }]);
    expect(Array.from(parent.children).map((element) => element.textContent)).toEqual(["Second", "First"]);
    expect(localStorage.getItem(`nudge-ui:${nudgeUiProjectId}:v5`)).toBeNull();
    expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toContain(`"schemaVersion":${SCHEMA_VERSION}`);
  });

  it.each([7, 8])("keeps structural changes while migrating a v%i session", (legacyVersion) => {
    const target = document.createElement("button");
    target.dataset.cid = "Item";
    target.dataset.src = "src/List.tsx:8:1";
    target.textContent = "Second";
    document.body.append(target);
    createStructuralDelete(target, `delete-v${legacyVersion}`);
    appendChange(makeTextChange());
    const legacy = JSON.parse(JSON.stringify(serializeSession())) as Record<string, unknown>;
    legacy.schemaVersion = legacyVersion;
    delete legacy.comparisonGroups;
    localStorage.setItem(`nudge-ui:${nudgeUiProjectId}:v${legacyVersion}`, JSON.stringify(legacy));
    localStorage.removeItem(storageKey(nudgeUiProjectId));

    resetStructuralDeleteProjection();
    document.body.replaceChildren(target);
    clearChanges();
    const result = hydrateSession();

    expect(result).toMatchObject({ restored: true, changeCount: 2 });
    expect(getStructuralChanges()).toMatchObject([{ id: `delete-v${legacyVersion}`, kind: "delete" }]);
    expect(getChangesList()).toMatchObject([{ kind: "text-content", id: "text-1" }]);
    expect(target.isConnected).toBe(false);
    expect(localStorage.getItem(`nudge-ui:${nudgeUiProjectId}:v${legacyVersion}`)).toBeNull();
  });

  it.each([3, 4, 5, 6])("reads v%i durable CSS, drops legacy runtime records, and upgrades safely", (legacyVersion) => {
    const legacyKey = `nudge-ui:${nudgeUiProjectId}:v${legacyVersion}`;
    localStorage.setItem(legacyKey, JSON.stringify({
      schemaVersion: legacyVersion,
      projectId: nudgeUiProjectId,
      mode: "inspect",
      inspectUrl: window.location.href,
      cards: [],
      camera: { x: 0, y: 0, zoom: 1 },
      changes: [
        makeElementChange({ rawValue: "red", oldToken: null, newToken: null }),
        {
          ...makeElementChange({ rawValue: "blue", oldToken: null, newToken: null }),
          scope: "runtime-preview",
          elementId: "instance-1",
        },
      ],
      structuralChanges: [],
    }));

    const result = hydrateSession();

    expect(result).toMatchObject({ restored: true, changeCount: 1 });
    expect(getChangesList()).toHaveLength(1);
    expect(localStorage.getItem(legacyKey)).toBeNull();
    expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toContain(`"schemaVersion":${SCHEMA_VERSION}`);
  });

  it("rejects structural payloads with generated marker or document-local fields", () => {
    localStorage.setItem(storageKey(nudgeUiProjectId), JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      projectId: nudgeUiProjectId,
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
        marker: "data-projection-instance",
      }],
    }));

    expect(hydrateSession()).toEqual({ restored: false, changeCount: 0 });
    expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toBeNull();
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
    localStorage.setItem(storageKey(nudgeUiProjectId), "not-valid-json{{");
    const result = hydrateSession();
    expect(result.restored).toBe(false);
    expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toBeNull();
  });

  it("returns no restoration for wrong schema version", () => {
    const session = JSON.stringify({
      schemaVersion: 999,
      projectId: nudgeUiProjectId,
      mode: "inspect",
      cards: [],
      camera: { x: 0, y: 0, zoom: 1 },
      changes: [],
    });
    localStorage.setItem(storageKey(nudgeUiProjectId), session);
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
      changes: [],
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
      changes: [],
    });
    localStorage.setItem(storageKey(nudgeUiProjectId), session);
    const result = hydrateSession();
    expect(result.restored).toBe(false);
  });

  it("returns no restoration for malformed change data (missing selector)", () => {
    const session = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      projectId: nudgeUiProjectId,
      mode: "inspect",
      cards: [],
      camera: { x: 0, y: 0, zoom: 1 },
      changes: [{ property: "color", source: { file: "x", line: 1, component: "X" } }],
    });
    localStorage.setItem(storageKey(nudgeUiProjectId), session);
    const result = hydrateSession();
    expect(result.restored).toBe(false);
  });

  it("rejects duplicate durable text IDs during hydration", () => {
    const session = serializeSession();
    session.changes = [
      makeTextChange(),
      makeTextChange({ id: "text-1", after: "Second" }),
    ];
    localStorage.setItem(storageKey(nudgeUiProjectId), JSON.stringify(session));

    expect(hydrateSession()).toEqual({ restored: false, changeCount: 0 });
    expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toBeNull();
  });

  it("rejects a restored repeated expression source-site override", () => {
    const session = serializeSession();
    session.changes = [makeComponentChange() as typeof session.changes[number]];
    const malformed = session.changes[0] as Extract<typeof session.changes[number], { kind: "component-prop" }>;
    malformed.authoredAs = "expression";
    malformed.scope = "source-site";
    malformed.evidence = {
      occurrence: 0,
      props: null,
      ariaLabel: null,
      beforeText: "primary",
      mountedCount: 2,
    };
    localStorage.setItem(storageKey(nudgeUiProjectId), JSON.stringify(session));

    expect(hydrateSession()).toEqual({ restored: false, changeCount: 0 });
    expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toBeNull();
  });

  it.each(["marker", "projectionMarker", "scope"])("rejects malformed text records with legacy %s fields", (field) => {
    const session = serializeSession();
    const malformed = {
      ...makeTextChange(),
      [field]: field === "scope" ? "runtime-preview" : "data-projection-text",
    };
    session.changes = [malformed as typeof session.changes[number]];
    localStorage.setItem(storageKey(nudgeUiProjectId), JSON.stringify(session));

    expect(hydrateSession()).toEqual({ restored: false, changeCount: 0 });
    expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toBeNull();
  });

  it("returns no restoration for bad camera data", () => {
    const session = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      projectId: nudgeUiProjectId,
      mode: "inspect",
      cards: [],
      camera: { x: "not-a-number", y: 0, zoom: 1 },
      changes: [],
    });
    localStorage.setItem(storageKey(nudgeUiProjectId), session);
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

  it("round-trips agent comparison group ownership with its cards", () => {
    setCanvasMode("canvas");
    appendCanvasComparisonGroup({
      id: "agent-landing-iterations",
      label: "Landing page iterations",
      agentId: "paired-agent",
      routes: [
        { url: localUrl("/landing-a"), label: "A" },
        { url: localUrl("/landing-b"), label: "B" },
      ],
    });
    persistSession();

    for (const card of getCanvasCards()) removeCanvasCardStore(card.id);
    expect(getCanvasComparisonGroups()).toEqual([]);
    hydrateSession();

    expect(getCanvasComparisonGroups()).toMatchObject([{
      id: "agent-landing-iterations",
      label: "Landing page iterations",
      owner: "agent",
      agentId: "paired-agent",
      routes: [{ label: "A" }, { label: "B" }],
    }]);
    expect(getCanvasCards()).toHaveLength(2);
    expect(getCanvasCards().every((card) => card.comparisonGroupId === "agent-landing-iterations")).toBe(true);
  });
});

describe("sessionStore clear session", () => {
  beforeEach(resetAllState);
  afterEach(resetAllState);

  it("removes localStorage entry", () => {
    appendChange(makeElementChange());
    persistSession();
    expect(localStorage.getItem(storageKey(nudgeUiProjectId))).not.toBeNull();

    clearSession();
    expect(localStorage.getItem(storageKey(nudgeUiProjectId))).toBeNull();
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

  it("full round-trip preserves standalone source columns and runtime evidence", () => {
    appendChange(makeElementChange({
      cid: "nudge-ui-runtime-1",
      file: "",
      line: 0,
      column: 0,
      selector: '[data-cid="nudge-ui-runtime-1"][data-src="nudge-ui:unknown:1"]',
      source: { file: "", line: 0, component: "nudge-ui-runtime-1" },
      runtimeEvidence: {
        tagName: "button",
        text: "Save",
        props: null,
        ariaLabel: "Save changes",
      },
    }));
    persistSession();

    clearChanges();
    hydrateSession();

    expect(getChangesList()).toMatchObject([{
      column: 0,
      runtimeEvidence: {
        tagName: "button",
        text: "Save",
        props: null,
        ariaLabel: "Save changes",
      },
    }]);
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
    appendChange(makeElementChange({
      previewResult: {
        status: "applied",
        requestedValue: "var(--color-b)",
        computedValue: "#bbbbbb",
      },
    }));
    persistSession();

    const raw = localStorage.getItem(storageKey(nudgeUiProjectId));
    expect(raw).not.toContain("previewResult");
    expect(raw).not.toContain("computedValue");
  });
});
