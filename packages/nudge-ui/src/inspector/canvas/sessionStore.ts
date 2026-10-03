import { isFrameContent, type FrameContent } from "./frameContent.ts";
import { canEditWorkspace, isWorkspaceHistoryLocked } from "../changes/workspaceChanges.ts";
import {
  getCanvasMode,
  getCanvasPresentation,
  getFrameGroups,
  isFrameGroup,
  type FrameGroup,
  type CanvasPresentation,
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
  resetStructuralDeleteProjection,
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
import { activateDraftForCard, clearDrafts, persistDrafts } from "../drafts/store.ts";

const SCHEMA_VERSION = 16;
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
  content: FrameContent;
  title: string | null;
  groupId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DurableSession {
  schemaVersion: typeof SCHEMA_VERSION;
  projectId: string;
  mode: CanvasMode;
  presentation: CanvasPresentation;
  groups: readonly FrameGroup[];
  inspectUrl: string;
  cards: SerializableCard[];
  camera: { x: number; y: number; zoom: number };
  focusedCardId?: string | null;
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
  const cards = getCanvasCards();
  const camera = getBoardCamera();
  const mode = getCanvasMode();

  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: projectId(),
    mode,
    presentation: getCanvasPresentation(),
    groups: getFrameGroups(),
    inspectUrl: window.location.href,
    cards: cards.map((c) => ({
      id: c.id,
      content: c.content.kind === "route" ? { kind: "route", url: c.content.url } : { ...c.content },
      title: c.title,
      ...(c.groupId ? { groupId: c.groupId } : {}),
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
    })),
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
    focusedCardId: getFocusedCardId(),
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
    persistDrafts();
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
      !isFrameContent(candidate.content, window.location.origin) ||
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
      content: c.content as FrameContent,
      title: typeof c.title === "string" ? c.title as string : null,
      ...(typeof c.groupId === "string" && c.groupId.length <= 256 ? { groupId: c.groupId } : {}),
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

  const presentation = s.presentation ?? "focus";
  const groups = s.groups ?? [];
  if ((presentation !== "focus" && presentation !== "canvas") || !Array.isArray(groups) || !groups.every(isFrameGroup)) {
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
    presentation,
    groups,
  );
  hydrateClipboardHandoff(clipboardHandoff);
  // A different URL means the user intentionally navigated while Inspect was
  // active. Keep the durable edits, but adopt the new route instead of
  // sending the user back to the previous page. On refresh, the URLs already
  // match and restoration remains unchanged.
  if (inspectRouteChanged) persistSessionUnchecked();
  return { restored: true, changeCount: 0 };
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
  if (!canEditWorkspace()) return;
  const cardId = getSelectedCardId() ?? getFocusedCardId();
  if (cardId) activateDraftForCard(cardId);
  clearWorkspaceLog();
  setSelectedElement(null);
  projectToAllReadyCards();
  scheduleAutoSave();
}

export function clearSession(): void {
  if (isWorkspaceHistoryLocked()) return;
  if (!canWriteWorkspace()) return;
  try {
    localStorage.removeItem(storageKey(projectId()));
  } catch {
    // ignore
  }

  clearWorkspaceLog();
  clearClipboardHandoff();
  clearDrafts();
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

export function scheduleCanvasSave(): void { scheduleAutoSave(); }

export function flushAutoSave(): void {
  if (autosaveTimer !== null) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  if (!autoSaveDirty) return;
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
