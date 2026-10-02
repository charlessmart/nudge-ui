import type { ChangeRecord } from "../changes/types.ts";
import { getWorkspaceChanges } from "../changes/workspaceChanges.ts";
import { loadWorkspaceChanges } from "../changes/changesLog.ts";
import {
  deserializeChange,
  isSerializableChange,
  serializeChange,
  type SerializableChange,
} from "../changes/codecs.ts";
import {
  getCanvasMode,
  getCanvasCards,
  getFocusedCardId,
  getSelectedCardId,
  getBoardCamera,
  setBoardCamera,
  hydrateCanvasStore,
  removeCanvasCard,
  type CanvasCamera,
  type CanvasMode,
} from "./canvasStore.ts";
import { applyRules } from "../projection/managedStylesheet.ts";
import { clearWorkspace as clearWorkspaceLog } from "../changes/changesLog.ts";
import { removeManagedSheet } from "../projection/managedStylesheet.ts";
import { setSelectedElement } from "../selection/selectionStore.ts";
import { canWriteWorkspace } from "./workspaceLease.ts";
import {
  isStructuralChange,
  resetStructuralDeleteProjection,
  type StructuralChange,
} from "../projection/structuralProjection.ts";
import { projectToAllReadyCards } from "./projection.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import {
  clearClipboardHandoff,
  getClipboardHandoffSnapshot,
  hydrateClipboardHandoff,
  isClipboardHandoffSnapshot,
  type ClipboardHandoffSnapshot,
} from "../prompt/clipboardHandoff.ts";
import { activateDraftForCard, clearVersionHistory } from "../history/store.ts";

// v12 introduced the edit model and preview diagnostic split; v13 removed the
// agent comparison-group record from the durable session. Agent-presented
// routes now persist as ordinary linked frames. Previous session shapes are
// intentionally incompatible.
const SCHEMA_VERSION = 13;
const STORAGE_PREFIX = "nudge-ui";

function projectId(): string {
  return getNudgeUiRuntimeConfig().projectId;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSameOriginUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).origin === window.location.origin;
  } catch {
    return false;
  }
}

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}:${projectId}:v${SCHEMA_VERSION}`;
}

export interface SerializableCard {
  id: string;
  url: string;
  title: string | null;
  duplicateOf?: string;
  artifactId?: string;
  linkedGroupId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DurableSession {
  schemaVersion: typeof SCHEMA_VERSION;
  projectId: string;
  mode: CanvasMode;
  inspectUrl: string;
  cards: SerializableCard[];
  camera: { x: number; y: number; zoom: number };
  focusedCardId?: string | null;
  changes: SerializableChange[];
  structuralChanges: StructuralChange[];
  clipboardHandoff: ClipboardHandoffSnapshot | null;
}

export type {
  SerializableChange,
  SerializableComponentChange,
  SerializableElementChange,
  SerializableTextContentChange,
  SerializableTokenChange,
  SerializableTokenRef,
} from "../changes/codecs.ts";

export interface HydrationResult {
  restored: boolean;
  changeCount: number;
}

function buildSession(): DurableSession {
  const workspace = getWorkspaceChanges();
  const changes = workspace.changes;
  const serializableChanges: SerializableChange[] = [];
  for (const change of changes) {
    const serialized = serializeChange(change);
    // serializeChange already fails closed, but re-validate here so a future
    // serializer skew can never poison the whole durable session.
    if (serialized && isSerializableChange(serialized)) serializableChanges.push(serialized);
  }

  const cards = getCanvasCards();
  const camera = getBoardCamera();
  const mode = getCanvasMode();

  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: projectId(),
    mode,
    inspectUrl: window.location.href,
    cards: cards.map((c) => ({
      id: c.id,
      url: c.url,
      title: c.title,
      ...(c.duplicateOf ? { duplicateOf: c.duplicateOf } : {}),
      ...(c.artifactId ? { artifactId: c.artifactId } : {}),
      ...(c.linkedGroupId ? { linkedGroupId: c.linkedGroupId } : {}),
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
    })),
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
    focusedCardId: getFocusedCardId(),
    changes: serializableChanges,
    structuralChanges: workspace.structuralChanges.map((change) => ({ ...change })),
    clipboardHandoff: getClipboardHandoffSnapshot(),
  };
}

export function serializeSession(): DurableSession {
  return buildSession();
}

export function persistSession(): boolean {
  if (!canWriteWorkspace()) return false;
  return persistSessionUnchecked();
}

/**
 * Serializes and writes the session without the write-lease gate. The public
 * persistence path checks the lease before calling this helper.
 */
function persistSessionUnchecked(): boolean {
  if (!projectId()) return false;
  try {
    const session = buildSession();
    localStorage.setItem(storageKey(projectId()), JSON.stringify(session));
    return true;
  } catch {
    // Storage unavailable or quota exceeded — silently ignore
    return false;
  }
}

export function hydrateSession(): HydrationResult {
  if (!projectId()) return { restored: false, changeCount: 0 };

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey(projectId()));
  } catch {
    return { restored: false, changeCount: 0 };
  }

  if (!raw) return { restored: false, changeCount: 0 };

  let session: unknown;
  try {
    session = JSON.parse(raw);
  } catch {
    safeDiscard();
    return { restored: false, changeCount: 0 };
  }

  if (!session || typeof session !== "object") {
    safeDiscard();
    return { restored: false, changeCount: 0 };
  }

  const s = session as Record<string, unknown>;

  if (typeof s.schemaVersion !== "number" || s.schemaVersion !== SCHEMA_VERSION) {
    safeDiscard();
    return { restored: false, changeCount: 0 };
  }

  if (typeof s.projectId !== "string" || s.projectId !== projectId()) {
    safeDiscard();
    return { restored: false, changeCount: 0 };
  }

  if (typeof s.mode !== "string" || (s.mode !== "inspect" && s.mode !== "canvas")) {
    safeDiscard();
    return { restored: false, changeCount: 0 };
  }

  if (!isSameOriginUrl(s.inspectUrl)) {
    safeDiscard();
    return { restored: false, changeCount: 0 };
  }

  const inspectRouteChanged = s.mode === "inspect" && s.inspectUrl !== window.location.href;

  const cards = Array.isArray(s.cards) ? (s.cards as unknown[]) : null;
  if (!cards) {
    safeDiscard();
    return { restored: false, changeCount: 0 };
  }

  const serializableCards: SerializableCard[] = [];
  for (const card of cards) {
    const candidate = card as Record<string, unknown>;
    if (
      !card || typeof card !== "object" ||
      typeof candidate.id !== "string" ||
      !isSameOriginUrl(candidate.url) ||
      !isFiniteNumber(candidate.x) ||
      !isFiniteNumber(candidate.y) ||
      !isFiniteNumber(candidate.width) ||
      !isFiniteNumber(candidate.height) ||
      candidate.width <= 0 ||
      candidate.height <= 0
    ) {
      safeDiscard();
      return { restored: false, changeCount: 0 };
    }
    const c = card as Record<string, unknown>;
    serializableCards.push({
      id: c.id as string,
      url: c.url as string,
      title: typeof c.title === "string" ? c.title as string : null,
      ...(typeof c.duplicateOf === "string" ? { duplicateOf: c.duplicateOf } : {}),
      ...(typeof c.linkedGroupId === "string" && c.linkedGroupId.length <= 256 ? { linkedGroupId: c.linkedGroupId } : {}),
      ...(typeof c.artifactId === "string" && /^[a-f0-9-]{36}$/i.test(c.artifactId) ? { artifactId: c.artifactId } : {}),
      x: c.x as number,
      y: c.y as number,
      width: c.width as number,
      height: c.height as number,
    });
  }

  if (new Set(serializableCards.map((card) => card.id)).size !== serializableCards.length) {
    safeDiscard();
    return { restored: false, changeCount: 0 };
  }

  const cardsById = new Map(serializableCards.map((card) => [card.id, card]));

  const cameraRaw = s.camera;
  if (
    !cameraRaw || typeof cameraRaw !== "object" ||
    !isFiniteNumber((cameraRaw as Record<string, unknown>).x) ||
    !isFiniteNumber((cameraRaw as Record<string, unknown>).y) ||
    !isFiniteNumber((cameraRaw as Record<string, unknown>).zoom)
  ) {
    safeDiscard();
    return { restored: false, changeCount: 0 };
  }

  const changesRaw = s.changes;
  if (!Array.isArray(changesRaw)) {
    safeDiscard();
    return { restored: false, changeCount: 0 };
  }
  const deserializedChanges: ChangeRecord[] = [];
  const textChangeIds = new Set<string>();
  for (const c of changesRaw) {
    if (!isSerializableChange(c)) {
      safeDiscard();
      return { restored: false, changeCount: 0 };
    }
    if (c.kind === "text-content") {
      if (textChangeIds.has(c.id)) {
        safeDiscard();
        return { restored: false, changeCount: 0 };
      }
      textChangeIds.add(c.id);
    }
    try {
      deserializedChanges.push(deserializeChange(c));
    } catch {
      safeDiscard();
      return { restored: false, changeCount: 0 };
    }
  }

  const structuralChanges = s.structuralChanges;
  if (!Array.isArray(structuralChanges) || !structuralChanges.every(isStructuralChange)) {
    safeDiscard();
    return { restored: false, changeCount: 0 };
  }

  const clipboardHandoff = s.clipboardHandoff;
  if (!isClipboardHandoffSnapshot(clipboardHandoff)) {
    safeDiscard();
    return { restored: false, changeCount: 0 };
  }

  const camera: CanvasCamera = {
    x: (cameraRaw as Record<string, unknown>).x as number,
    y: (cameraRaw as Record<string, unknown>).y as number,
    zoom: (cameraRaw as Record<string, unknown>).zoom as number,
  };
  const focusedCardId = s.focusedCardId === undefined || s.focusedCardId === null
    ? null
    : typeof s.focusedCardId === "string" && cardsById.has(s.focusedCardId)
      ? s.focusedCardId
      : undefined;
  if (focusedCardId === undefined) {
    safeDiscard();
    return { restored: false, changeCount: 0 };
  }

  hydrateCanvasStore(
    s.mode as CanvasMode,
    serializableCards,
    camera,
    focusedCardId,
  );
  // Structural intent and instance evidence become visible atomically. The
  // projection layer preserves structural-first document application order.
  loadWorkspaceChanges(deserializedChanges, structuralChanges);
  hydrateClipboardHandoff(clipboardHandoff);
  // A different URL means the user intentionally navigated while Inspect was
  // active. Keep the durable edits, but adopt the new route instead of
  // sending the user back to the previous page. On refresh, the URLs already
  // match and restoration remains unchanged.
  if (inspectRouteChanged) persistSessionUnchecked();
  projectToAllReadyCards();

  return { restored: true, changeCount: deserializedChanges.length + structuralChanges.length };
}

function safeDiscard(): void {
  try {
    localStorage.removeItem(storageKey(projectId()));
  } catch {
    // ignore
  }
}

/** Clears the active frame's edit draft while preserving canvas geometry and other drafts. */
export function clearSelectedFrameChanges(): void {
  if (!canWriteWorkspace()) return;
  const cardId = getSelectedCardId() ?? getFocusedCardId();
  if (cardId) activateDraftForCard(cardId);
  clearWorkspaceLog();
  setSelectedElement(null);
  projectToAllReadyCards();
  scheduleAutoSave();
}

export function clearSession(): void {
  if (!canWriteWorkspace()) return;
  try {
    localStorage.removeItem(storageKey(projectId()));
  } catch {
    // ignore
  }

  clearWorkspaceLog();
  clearClipboardHandoff();
  clearVersionHistory();
  resetStructuralDeleteProjection();
  removeManagedSheet();
  setSelectedElement(null);

  for (const card of getCanvasCards()) {
    removeCanvasCard(card.id);
  }
  setBoardCamera({ x: 0, y: 0, zoom: 1 });

  applyRules([]);
  autoSaveDirty = false;
  if (autosaveTimer !== null) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
}

let autoSaveEnabled = false;
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let autoSaveDirty = false;
const AUTOSAVE_DEBOUNCE_MS = 500;

export function enableAutoSave(): void {
  if (autoSaveEnabled) return;
  autoSaveEnabled = true;
  window.addEventListener("beforeunload", flushAutoSave);
}

/**
 * Coalesces the synchronous full-session `JSON.stringify` + `localStorage`
 * write behind a trailing timer so commits never block on persistence. A
 * refresh or close inside the debounce window still flushes on `beforeunload`.
 */
export function scheduleAutoSave(): void {
  if (!autoSaveEnabled) return;
  autoSaveDirty = true;
  if (autosaveTimer !== null) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    if (!autoSaveDirty) return;
    if (persistSession()) autoSaveDirty = false;
  }, AUTOSAVE_DEBOUNCE_MS);
}

/**
 * Canvas mode/card/camera changes persist immediately (synchronous) so a
 * refresh always restores the workspace, even inside the edit-autosave
 * debounce window. Edit autosave stays coalesced behind the trailing timer.
 */
export function scheduleCanvasSave(): void {
  if (!autoSaveEnabled) return;
  if (persistSession()) autoSaveDirty = false;
}

function flushAutoSave(): void {
  if (autosaveTimer !== null) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  if (!autoSaveDirty) return;
  // Keep the normal lease gate on the unload path. The controller registers
  // this listener before releaseLease, so a current owner can flush a first
  // write without allowing a stale tab to overwrite the new owner's session.
  if (persistSession()) autoSaveDirty = false;
}

let restoreCount = 0;

export function getRestoreCount(): number {
  return restoreCount;
}

export function setRestoreCount(count: number): void {
  restoreCount = count;
}

export function clearRestoreCount(): void {
  restoreCount = 0;
}

export function resetAutoSave(): void {
  autoSaveEnabled = false;
  autoSaveDirty = false;
  if (autosaveTimer !== null) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  window.removeEventListener("beforeunload", flushAutoSave);
}

export { storageKey, SCHEMA_VERSION, type SerializableCard as HydratedCard };
