import { designToolProjectId } from "virtual:design-tokens";
import type { ChangeRecord } from "../changesLog.ts";
import {
  getChangesList,
  loadChanges,
  isComponentChange,
  isTokenChange,
  type ComponentChangeRecord,
  type ElementChangeRecord,
  type TokenChangeRecord,
} from "../changesLog.ts";
import {
  getCanvasMode,
  setCanvasMode,
  getCanvasCards,
  getBoardCamera,
  setBoardCamera,
  hydrateCanvasStore,
  removeCanvasCard,
  type CanvasCamera,
  type CanvasMode,
} from "./canvasStore.ts";
import { applyRules } from "../managedStylesheet.ts";
import { clearChanges as clearChangesLog } from "../changesLog.ts";
import { removeManagedSheet } from "../managedStylesheet.ts";
import { clearInspectorLayout } from "../panelLayout.ts";
import { setSelectedElement } from "../selectionStore.ts";
import type { TokenEntry } from "virtual:design-tokens";
import { canWriteWorkspace } from "./workspaceLease.ts";
import { clearDomMutations } from "../domMutations.ts";
import type { StyleRuleContext } from "../managedStylesheet.ts";

const SCHEMA_VERSION = 3;
const STORAGE_PREFIX = "design-tool";

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

function isSource(value: unknown): value is { file: string; line: number; component: string } {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return typeof source.file === "string"
    && isFiniteNumber(source.line)
    && typeof source.component === "string";
}

function isTokenRef(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const token = value as Record<string, unknown>;
  return typeof token.name === "string"
    && typeof token.value === "string"
    && typeof token.source === "string";
}

function isStyleRuleContext(value: unknown): value is StyleRuleContext {
  if (!value || typeof value !== "object") return false;
  const wrappers = (value as { wrappers?: unknown }).wrappers;
  return wrappers === undefined || (Array.isArray(wrappers) && wrappers.every((wrapper) => {
    if (!wrapper || typeof wrapper !== "object") return false;
    const candidate = wrapper as { kind?: unknown; params?: unknown };
    return (candidate.kind === "media" || candidate.kind === "supports"
      || candidate.kind === "scope" || candidate.kind === "layer")
      && typeof candidate.params === "string";
  }));
}

function isSerializableChange(value: unknown): value is SerializableChange {
  if (!value || typeof value !== "object") return false;
  const change = value as Record<string, unknown>;
  if (change.kind === "component-prop") {
    const target = change.target as Record<string, unknown> | undefined;
    const before = change.before as Record<string, unknown> | undefined;
    const validBefore = before?.kind === "default"
      || (before?.kind === "value"
        && (typeof before.value === "string"
          || typeof before.value === "number"
          || typeof before.value === "boolean"));
    return target !== undefined
      && target.framework === "react"
      && typeof target.componentId === "string"
      && typeof target.callsiteId === "string"
      && typeof target.componentName === "string"
      && typeof target.file === "string"
      && isFiniteNumber(target.line)
      && isFiniteNumber(target.column)
      && typeof change.property === "string"
      && validBefore
      && (typeof change.after === "string"
        || typeof change.after === "number"
        || typeof change.after === "boolean")
      && (change.authoredAs === "literal"
        || change.authoredAs === "expression"
        || change.authoredAs === "spread"
        || change.authoredAs === "default");
  }
  if (
    typeof change.selector !== "string"
    || typeof change.property !== "string"
    || !isSource(change.source)
    || typeof change.file !== "string"
    || !isFiniteNumber(change.line)
  ) return false;
  if (change.kind === "token") {
    return typeof change.tokenName === "string"
      && typeof change.rawValue === "string"
      && typeof change.oldRawValue === "string"
      && isStyleRuleContext(change.context)
      && typeof change.contextLabel === "string";
  }
  return (change.kind === undefined || change.kind === "element")
    && typeof change.cid === "string"
    && isTokenRef(change.oldToken)
    && isTokenRef(change.newToken);
}

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}:${projectId}:v${SCHEMA_VERSION}`;
}

interface SerializableTokenRef {
  name: string;
  value: string;
  source: string;
  cssValue?: string;
  cssName?: string;
  adapter?: string;
  origin?: string;
}

export interface SerializableCard {
  id: string;
  url: string;
  title: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SerializableElementChange {
  kind?: "element";
  cid: string;
  file: string;
  line: number;
  selector: string;
  property: string;
  sourceProperty?: string;
  sourceAuthoredValue?: string;
  oldToken: SerializableTokenRef | null;
  newToken: SerializableTokenRef | null;
  rawValue?: string;
  oldRawValue?: string;
  source: { file: string; line: number; component: string };
  scope?: "source-site";
  state?: "base" | "hover" | "active" | "focus" | "focus-visible" | "disabled";
}

export interface SerializableTokenChange {
  kind: "token";
  tokenName: string;
  file: string;
  line: number;
  selector: string;
  property: string;
  rawValue: string;
  oldRawValue: string;
  context: StyleRuleContext;
  contextLabel: string;
  source: { file: string; line: number; component: string };
}

export interface SerializableComponentChange {
  kind: "component-prop";
  target: {
    framework: "react";
    componentId: string;
    callsiteId: string;
    componentName: string;
    file: string;
    line: number;
    column: number;
  };
  property: string;
  before:
    | { kind: "default" }
    | { kind: "value"; value: string | number | boolean };
  after: string | number | boolean;
  authoredAs: "literal" | "expression" | "spread" | "default";
}

export type SerializableChange =
  | SerializableElementChange
  | SerializableTokenChange
  | SerializableComponentChange;

export interface DurableSession {
  schemaVersion: typeof SCHEMA_VERSION;
  projectId: string;
  mode: CanvasMode;
  inspectUrl: string;
  cards: SerializableCard[];
  camera: { x: number; y: number; zoom: number };
  changes: SerializableChange[];
}

function serializeTokenRef(token: TokenEntry | null): SerializableTokenRef | null {
  if (!token) return null;
  return {
    name: token.name,
    value: token.value ?? "",
    source: token.source ?? "",
    cssValue: token.cssValue,
    cssName: token.cssName,
    adapter: token.adapter,
    origin: token.origin,
  };
}

function serializeElementChange(change: ElementChangeRecord): SerializableElementChange | null {
  if (change.scope === "instance-preview") return null;
  return {
    kind: change.kind,
    cid: change.cid,
    file: change.file,
    line: change.line,
    selector: change.selector,
    property: change.property,
    sourceProperty: change.sourceProperty,
    sourceAuthoredValue: change.sourceAuthoredValue,
    oldToken: serializeTokenRef(change.oldToken),
    newToken: serializeTokenRef(change.newToken),
    rawValue: change.rawValue,
    oldRawValue: change.oldRawValue,
    source: change.source,
    scope: change.scope ?? "source-site",
    state: change.state,
  };
}

function serializeTokenChange(change: TokenChangeRecord): SerializableTokenChange {
  return {
    kind: "token",
    tokenName: change.tokenName,
    file: change.file,
    line: change.line,
    selector: change.selector,
    property: change.property,
    rawValue: change.rawValue,
    oldRawValue: change.oldRawValue,
    context: change.context.wrappers?.length
      ? { wrappers: change.context.wrappers.map((wrapper) => ({ ...wrapper })) }
      : {},
    contextLabel: change.contextLabel ?? "",
    source: change.source,
  };
}

function serializeComponentChange(change: ComponentChangeRecord): SerializableComponentChange {
  return {
    kind: "component-prop",
    target: { ...change.target },
    property: change.property,
    before: change.before.kind === "default"
      ? { kind: "default" }
      : { kind: "value", value: change.before.value },
    after: change.after,
    authoredAs: change.authoredAs,
  };
}

function serializeChange(change: ChangeRecord): SerializableChange | null {
  if (isTokenChange(change)) return serializeTokenChange(change);
  if (isComponentChange(change)) return serializeComponentChange(change);
  return serializeElementChange(change);
}

function deserializeTokenRef(serialized: SerializableTokenRef | null): TokenEntry | null {
  if (!serialized) return null;
  return {
    name: serialized.name,
    value: serialized.value,
    source: serialized.source,
    cssValue: serialized.cssValue,
    cssName: serialized.cssName,
    adapter: serialized.adapter,
    origin: serialized.origin as TokenEntry["origin"],
  };
}

function deserializeElementChange(s: SerializableElementChange): ElementChangeRecord {
  return {
    kind: s.kind,
    cid: s.cid,
    file: s.file,
    line: s.line,
    selector: s.selector,
    property: s.property,
    sourceProperty: s.sourceProperty,
    sourceAuthoredValue: s.sourceAuthoredValue,
    oldToken: deserializeTokenRef(s.oldToken),
    newToken: deserializeTokenRef(s.newToken),
    rawValue: s.rawValue,
    oldRawValue: s.oldRawValue,
    source: s.source,
    scope: s.scope ?? "source-site",
    state: s.state,
  };
}

function deserializeTokenChange(s: SerializableTokenChange): TokenChangeRecord {
  return {
    kind: "token",
    tokenName: s.tokenName,
    file: s.file,
    line: s.line,
    selector: s.selector,
    property: s.property,
    rawValue: s.rawValue,
    oldRawValue: s.oldRawValue,
    context: s.context ?? {},
    contextLabel: s.contextLabel ?? "",
    source: s.source,
  };
}

function deserializeComponentChange(s: SerializableComponentChange): ComponentChangeRecord {
  return {
    kind: "component-prop",
    target: { ...s.target },
    property: s.property,
    before: s.before.kind === "default"
      ? { kind: "default" }
      : { kind: "value", value: s.before.value },
    after: s.after,
    authoredAs: s.authoredAs,
  };
}

function deserializeChange(s: SerializableChange): ChangeRecord {
  if (s.kind === "token") return deserializeTokenChange(s);
  if (s.kind === "component-prop") return deserializeComponentChange(s);
  return deserializeElementChange(s);
}

export interface HydrationResult {
  restored: boolean;
  changeCount: number;
}

function buildSession(): DurableSession {
  const changes = getChangesList();
  const serializableChanges: SerializableChange[] = [];
  for (const change of changes) {
    const serialized = serializeChange(change);
    if (serialized) serializableChanges.push(serialized);
  }

  const cards = getCanvasCards();
  const camera = getBoardCamera();
  const mode = getCanvasMode();

  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: designToolProjectId,
    mode,
    inspectUrl: window.location.href,
    cards: cards.map((c) => ({
      id: c.id,
      url: c.url,
      title: c.title,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
    })),
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
    changes: serializableChanges,
  };
}

export function serializeSession(): DurableSession {
  return buildSession();
}

export function persistSession(): void {
  if (!canWriteWorkspace()) return;
  if (!designToolProjectId) return;
  try {
    const session = buildSession();
    localStorage.setItem(storageKey(designToolProjectId), JSON.stringify(session));
  } catch {
    // Storage unavailable or quota exceeded — silently ignore
  }
}

export function hydrateSession(): HydrationResult {
  if (!designToolProjectId) return { restored: false, changeCount: 0 };

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey(designToolProjectId));
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

  if (typeof s.projectId !== "string" || s.projectId !== designToolProjectId) {
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

  const changesRaw = Array.isArray(s.changes) ? s.changes : [];
  const deserializedChanges: ChangeRecord[] = [];
  for (const c of changesRaw) {
    if (!isSerializableChange(c)) {
      safeDiscard();
      return { restored: false, changeCount: 0 };
    }
    try {
      deserializedChanges.push(deserializeChange(c));
    } catch {
      safeDiscard();
      return { restored: false, changeCount: 0 };
    }
  }

  const camera: CanvasCamera = {
    x: (cameraRaw as Record<string, unknown>).x as number,
    y: (cameraRaw as Record<string, unknown>).y as number,
    zoom: (cameraRaw as Record<string, unknown>).zoom as number,
  };

  hydrateCanvasStore(s.mode as CanvasMode, serializableCards, camera);
  if (deserializedChanges.length > 0) {
    loadChanges(deserializedChanges);
  }
  // A different URL means the user intentionally navigated while Inspect was
  // active. Keep the durable edits, but adopt the new route instead of
  // sending the user back to the previous page. On refresh, the URLs already
  // match and restoration remains unchanged.
  if (inspectRouteChanged) persistSession();

  return { restored: true, changeCount: deserializedChanges.length };
}

function safeDiscard(): void {
  try {
    localStorage.removeItem(storageKey(designToolProjectId));
  } catch {
    // ignore
  }
}

export function clearSession(): void {
  if (!canWriteWorkspace()) return;
  try {
    localStorage.removeItem(storageKey(designToolProjectId));
  } catch {
    // ignore
  }

  clearChangesLog();
  clearDomMutations(true);
  removeManagedSheet();
  setSelectedElement(null);
  clearInspectorLayout();

  for (const card of getCanvasCards()) {
    removeCanvasCard(card.id);
  }
  setBoardCamera({ x: 0, y: 0, zoom: 1 });

  applyRules([]);
}

let autoSaveEnabled = false;

export function enableAutoSave(): void {
  if (autoSaveEnabled) return;
  autoSaveEnabled = true;
  window.addEventListener("beforeunload", persistSession);
}

export function scheduleAutoSave(): void {
  if (!autoSaveEnabled) return;
  persistSession();
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
  window.removeEventListener("beforeunload", persistSession);
}

export { storageKey, SCHEMA_VERSION, type SerializableCard as HydratedCard };
