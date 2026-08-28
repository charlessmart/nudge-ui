import type { ChangeRecord } from "../changesLog.ts";
import {
  getChangesList,
  loadChanges,
  isComponentChange,
  isTokenChange,
  isTextContentChangeValue,
  type ComponentChangeRecord,
  type ElementChangeRecord,
  type TextContentChangeRecord,
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
import type { StyleRuleContext } from "../managedStylesheet.ts";
import {
  isRenderedInstanceOverride,
  isRenderedInstanceRef,
  resolveRenderedInstance,
  type RenderedInstanceOverride,
  type RenderedInstanceRef,
} from "../renderedInstance.ts";
import {
  getStructuralChanges,
  hydrateStructuralChanges,
  isStructuralChange,
  clearStructuralChanges,
  resetStructuralDeleteProjection,
  type StructuralChange,
} from "../structuralProjection.ts";
import { projectToAllReadyCards } from "./projection.ts";
import type { TextProjectionTarget } from "../textChangeBoundary.ts";
import { getNudgeUiRuntimeConfig } from "../runtimeConfig.ts";

const SCHEMA_VERSION = 8;
// v3 is the released durable-session schema. v4 was a prerelease schema, v5
// added structural snapshots, v6 added presentation metadata to moves, and v7
// adds durable rendered-text projection records; v8 adds explicit text scope
// and bounded semantic evidence.
const LEGACY_SCHEMA_VERSIONS = [3, 4, 5, 6, 7] as const;
const STORAGE_PREFIX = "nudge-ui";

function projectId(): string {
  return getNudgeUiRuntimeConfig().projectId;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isRuntimeElementEvidence(value: unknown): value is NonNullable<ElementChangeRecord["runtimeEvidence"]> {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["tagName", "text", "props", "ariaLabel"])) return false;
  return typeof value.tagName === "string"
    && (typeof value.text === "string" || value.text === null)
    && (typeof value.props === "string" || value.props === null)
    && (typeof value.ariaLabel === "string" || value.ariaLabel === null);
}

/** Durable instance records must not smuggle document-local projection state. */
function isStrictRenderedInstanceOverride(value: unknown): value is RenderedInstanceOverride {
  if (!isRenderedInstanceOverride(value) || !value || typeof value !== "object") return false;
  const override = value as unknown as Record<string, unknown>;
  const target = override.target as Record<string, unknown>;
  const source = target.sourceSite as Record<string, unknown>;
  const locator = target.locator as Record<string, unknown>;
  if (!hasOnlyKeys(override, ["id", "target"])
    || !hasOnlyKeys(target, ["sourceSite", "locator"])
    || !hasOnlyKeys(source, ["cid", "src"])) return false;
  return locator.kind === "evidence"
    && hasOnlyKeys(locator, ["kind", "occurrence", "props", "text", "ariaLabel"]);
}

function isStrictRenderedInstanceRef(value: unknown): value is RenderedInstanceRef {
  if (!isRenderedInstanceRef(value) || !value || typeof value !== "object") return false;
  const ref = value as unknown as Record<string, unknown>;
  const source = ref.sourceSite as Record<string, unknown>;
  const locator = ref.locator as Record<string, unknown>;
  return hasOnlyKeys(ref, ["sourceSite", "locator"])
    && hasOnlyKeys(source, ["cid", "src"])
    && locator.kind === "evidence"
    && hasOnlyKeys(locator, ["kind", "occurrence", "props", "text", "ariaLabel"]);
}

interface LegacyStructuralDelete {
  id: string;
  kind: "delete";
  target: RenderedInstanceRef;
}

interface LegacyStructuralMove {
  id: string;
  kind: "move";
  target: RenderedInstanceRef;
  destination: {
    parent: RenderedInstanceRef;
    before: RenderedInstanceRef | null;
  };
}

type LegacyStructuralChange = LegacyStructuralDelete | LegacyStructuralMove;

function isLegacyStructuralChange(value: unknown): value is LegacyStructuralChange {
  if (!value || typeof value !== "object") return false;
  const change = value as Record<string, unknown>;
  if (change.kind === "delete") {
    return hasOnlyKeys(change, ["id", "kind", "target"])
      && typeof change.id === "string"
      && isStrictRenderedInstanceRef(change.target);
  }
  if (change.kind !== "move" || !change.destination || typeof change.destination !== "object") return false;
  const destination = change.destination as Record<string, unknown>;
  return hasOnlyKeys(change, ["id", "kind", "target", "destination"])
    && typeof change.id === "string"
    && isStrictRenderedInstanceRef(change.target)
    && hasOnlyKeys(destination, ["parent", "before"])
    && isStrictRenderedInstanceRef(destination.parent)
    && (destination.before === null || isStrictRenderedInstanceRef(destination.before));
}

/**
 * v5 persisted the durable move intent but not display metadata. Replay that
 * intent in a detached DOM so its original parent and sibling indexes remain
 * available to v6 without touching the live page before hydration.
 */
function migrateV5StructuralChanges(value: unknown): StructuralChange[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const scratch = document.implementation.createHTMLDocument("nudge-ui-session-migration");
  scratch.documentElement.innerHTML = document.documentElement.innerHTML;
  const migrated: StructuralChange[] = [];

  for (const candidate of value) {
    const change = isStructuralChange(candidate)
      ? candidate
      : isLegacyStructuralChange(candidate) ? migrateLegacyMove(scratch, candidate) : null;
    if (!change) return null;
    if (!applyStructuralChangeToScratch(scratch, change)) return null;
    migrated.push(change);
  }
  return migrated;
}

function migrateLegacyMove(doc: Document, change: LegacyStructuralChange): StructuralChange | null {
  if (change.kind === "delete") return change;
  const target = resolveRenderedInstance(doc, change.target);
  const parent = resolveRenderedInstance(doc, change.destination.parent);
  const before = change.destination.before ? resolveRenderedInstance(doc, change.destination.before) : null;
  if (target.status !== "resolved" || parent.status !== "resolved" || (before && before.status !== "resolved")) {
    return null;
  }
  if (target.element.parentElement !== parent.element || target.element === parent.element
    || target.element.contains(parent.element)
    || (before && (before.element.parentElement !== parent.element || before.element === target.element))) {
    return null;
  }
  const children = Array.from(parent.element.children);
  const fromIndex = children.indexOf(target.element);
  const beforeIndex = before ? children.indexOf(before.element) : children.length;
  if (fromIndex < 0 || beforeIndex < 0) return null;
  return {
    ...change,
    presentation: {
      parentTag: parent.element.tagName.toLowerCase(),
      fromIndex,
      toIndex: before ? beforeIndex - (fromIndex < beforeIndex ? 1 : 0) : children.length - 1,
    },
  };
}

function applyStructuralChangeToScratch(doc: Document, change: StructuralChange): boolean {
  const target = resolveRenderedInstance(doc, change.target);
  if (target.status !== "resolved") return false;
  if (change.kind === "delete") {
    target.element.replaceWith(doc.createComment("nudge-ui-session-migration"));
    return true;
  }
  const parent = resolveRenderedInstance(doc, change.destination.parent);
  const before = change.destination.before ? resolveRenderedInstance(doc, change.destination.before) : null;
  if (parent.status !== "resolved" || (before && before.status !== "resolved")) return false;
  if (target.element.parentElement !== parent.element || target.element === parent.element
    || target.element.contains(parent.element)
    || (before && (before.element.parentElement !== parent.element || before.element === target.element))) {
    return false;
  }
  parent.element.insertBefore(target.element, before?.element ?? null);
  return true;
}

function isLegacyRuntimePreview(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  // A text-content record must pass its own strict schema. Never let the
  // legacy preview cleanup silently discard malformed durable text intent.
  if (record.kind === "text-content") return false;
  // These were document/renderer-local implementation details in the former
  // preview path. A parsed JSON value cannot contain a live Node, but it can
  // still contain one of these stale handles; discard the whole record rather
  // than reinterpreting it against a newly rendered document.
  return (typeof record.scope === "string" && record.scope !== "source-site" && record.scope !== "rendered-instance")
    || ["element", "node", "placeholder", "elementId", "instanceId", "marker", "projectionMarker"]
      .some((key) => key in record);
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
    const evidence = change.evidence;
    const evidenceRecord = isRecord(evidence) ? evidence : null;
    const validEvidence = evidence === undefined || (
      evidenceRecord !== null
      && hasOnlyKeys(evidenceRecord, ["occurrence", "props", "ariaLabel", "beforeText", "mountedCount"])
      && typeof evidenceRecord.occurrence === "number"
      && Number.isSafeInteger(evidenceRecord.occurrence)
      && evidenceRecord.occurrence >= 0
      && (typeof evidenceRecord.props === "string" || evidenceRecord.props === null)
      && (typeof evidenceRecord.ariaLabel === "string" || evidenceRecord.ariaLabel === null)
      && typeof evidenceRecord.beforeText === "string"
      && typeof evidenceRecord.mountedCount === "number"
      && Number.isSafeInteger(evidenceRecord.mountedCount)
      && evidenceRecord.mountedCount >= 0
    );
    const mountedCount = evidenceRecord?.mountedCount;
    const repeatedUnsafeSourceOverride = typeof mountedCount === "number"
      && mountedCount > 1
      && (change.authoredAs === "expression" || change.authoredAs === "spread")
      && change.scope !== "rendered-instance";
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
        || change.authoredAs === "default")
      && (change.scope === undefined || change.scope === "source-site" || change.scope === "rendered-instance")
      && validEvidence
      && !repeatedUnsafeSourceOverride;
  }
  if (change.kind === "text-content") return isTextContentChangeValue(change);
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
    && (change.column === undefined
      || (isFiniteNumber(change.column) && Number.isSafeInteger(change.column) && change.column >= 0))
    && (change.runtimeEvidence === undefined || isRuntimeElementEvidence(change.runtimeEvidence))
    && isTokenRef(change.oldToken)
    && isTokenRef(change.newToken)
    && (change.scope === undefined || change.scope === "source-site" || change.scope === "rendered-instance")
    && (change.scope !== "rendered-instance" || isStrictRenderedInstanceOverride(change.instanceOverride));
}

function storageKeyForVersion(projectId: string, schemaVersion: number): string {
  return `${STORAGE_PREFIX}:${projectId}:v${schemaVersion}`;
}

function storageKey(projectId: string): string {
  return storageKeyForVersion(projectId, SCHEMA_VERSION);
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
  column?: number;
  selector: string;
  property: string;
  sourceProperty?: string;
  sourceAuthoredValue?: string;
  oldToken: SerializableTokenRef | null;
  newToken: SerializableTokenRef | null;
  rawValue?: string;
  oldRawValue?: string;
  source: { file: string; line: number; component: string };
  runtimeEvidence?: ElementChangeRecord["runtimeEvidence"];
  scope?: "source-site" | "rendered-instance";
  instanceOverride?: RenderedInstanceOverride;
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
  scope?: "source-site" | "rendered-instance";
  evidence?: {
    occurrence: number;
    props: string | null;
    ariaLabel: string | null;
    beforeText: string;
    mountedCount: number;
  };
}

export interface SerializableTextContentChange {
  kind: "text-content";
  id: string;
  target: TextProjectionTarget;
  source: { file: string; line: number; column: number; component: string };
  selector: string;
  before: string;
  after: string;
  authoredAs: "literal" | "expression" | "unknown";
  scope?: "source-site" | "rendered-instance";
  evidence?: TextContentChangeRecord["evidence"];
}

export type SerializableChange =
  | SerializableElementChange
  | SerializableTokenChange
  | SerializableComponentChange
  | SerializableTextContentChange;

export interface DurableSession {
  schemaVersion: typeof SCHEMA_VERSION;
  projectId: string;
  mode: CanvasMode;
  inspectUrl: string;
  cards: SerializableCard[];
  camera: { x: number; y: number; zoom: number };
  changes: SerializableChange[];
  structuralChanges: StructuralChange[];
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
  return {
    kind: change.kind,
    cid: change.cid,
    file: change.file,
    line: change.line,
    column: change.column,
    selector: change.selector,
    property: change.property,
    sourceProperty: change.sourceProperty,
    sourceAuthoredValue: change.sourceAuthoredValue,
    oldToken: serializeTokenRef(change.oldToken),
    newToken: serializeTokenRef(change.newToken),
    rawValue: change.rawValue,
    oldRawValue: change.oldRawValue,
    source: change.source,
    runtimeEvidence: change.runtimeEvidence ? { ...change.runtimeEvidence } : undefined,
    scope: change.scope === "rendered-instance" ? "rendered-instance" : "source-site",
    instanceOverride: change.scope === "rendered-instance" ? change.instanceOverride : undefined,
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
    scope: change.scope,
    evidence: change.evidence ? { ...change.evidence } : undefined,
  };
}

function serializeTextContentChange(change: TextContentChangeRecord): SerializableTextContentChange {
  return {
    kind: "text-content",
    id: change.id,
    target: {
      sourceSite: { ...change.target.sourceSite },
      occurrence: change.target.occurrence,
      props: change.target.props,
      ariaLabel: change.target.ariaLabel,
      beforeText: change.target.beforeText,
      ...(change.target.textNodePath
        ? { textNodePath: [...change.target.textNodePath] }
        : {}),
    },
    source: { ...change.source },
    selector: change.selector,
    before: change.before,
    after: change.after,
    authoredAs: change.authoredAs,
    scope: change.scope,
    evidence: change.evidence ? { ...change.evidence } : undefined,
  };
}

function serializeChange(change: ChangeRecord): SerializableChange | null {
  if (isTokenChange(change)) return serializeTokenChange(change);
  if (isComponentChange(change)) {
    const repeatedUnsafeSourceOverride = change.evidence?.mountedCount !== undefined
      && change.evidence.mountedCount > 1
      && (change.authoredAs === "expression" || change.authoredAs === "spread")
      && change.scope !== "rendered-instance";
    return repeatedUnsafeSourceOverride ? null : serializeComponentChange(change);
  }
  if (change.kind === "text-content") return serializeTextContentChange(change);
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
    column: s.column,
    selector: s.selector,
    property: s.property,
    sourceProperty: s.sourceProperty,
    sourceAuthoredValue: s.sourceAuthoredValue,
    oldToken: deserializeTokenRef(s.oldToken),
    newToken: deserializeTokenRef(s.newToken),
    rawValue: s.rawValue,
    oldRawValue: s.oldRawValue,
    source: s.source,
    runtimeEvidence: s.runtimeEvidence ? { ...s.runtimeEvidence } : undefined,
    scope: s.scope ?? "source-site",
    instanceOverride: s.scope === "rendered-instance" ? s.instanceOverride : undefined,
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
    scope: s.scope,
    evidence: s.evidence ? { ...s.evidence } : undefined,
  };
}

function deserializeTextContentChange(s: SerializableTextContentChange): TextContentChangeRecord {
  return {
    kind: "text-content",
    id: s.id,
    target: {
      sourceSite: { ...s.target.sourceSite },
      occurrence: s.target.occurrence,
      props: s.target.props,
      ariaLabel: s.target.ariaLabel,
      beforeText: s.target.beforeText,
      ...(s.target.textNodePath
        ? { textNodePath: [...s.target.textNodePath] }
        : {}),
    },
    source: { ...s.source },
    selector: s.selector,
    before: s.before,
    after: s.after,
    authoredAs: s.authoredAs,
    scope: s.scope,
    evidence: s.evidence ? { ...s.evidence } : undefined,
  };
}

function deserializeChange(s: SerializableChange): ChangeRecord {
  if (s.kind === "token") return deserializeTokenChange(s);
  if (s.kind === "component-prop") return deserializeComponentChange(s);
  if (s.kind === "text-content") return deserializeTextContentChange(s);
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
    projectId: projectId(),
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
    structuralChanges: getStructuralChanges().map((change) => ({ ...change })),
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
  let schemaVersion = SCHEMA_VERSION;
  try {
    raw = localStorage.getItem(storageKey(projectId()));
    if (!raw) {
      for (const legacyVersion of LEGACY_SCHEMA_VERSIONS) {
        raw = localStorage.getItem(storageKeyForVersion(projectId(), legacyVersion));
        if (raw) {
          schemaVersion = legacyVersion;
          break;
        }
      }
    }
  } catch {
    return { restored: false, changeCount: 0 };
  }

  if (!raw) return { restored: false, changeCount: 0 };

  let session: unknown;
  try {
    session = JSON.parse(raw);
  } catch {
    safeDiscard(schemaVersion);
    return { restored: false, changeCount: 0 };
  }

  if (!session || typeof session !== "object") {
    safeDiscard(schemaVersion);
    return { restored: false, changeCount: 0 };
  }

  const s = session as Record<string, unknown>;

  if (typeof s.schemaVersion !== "number" || s.schemaVersion !== schemaVersion) {
    safeDiscard(schemaVersion);
    return { restored: false, changeCount: 0 };
  }

  if (typeof s.projectId !== "string" || s.projectId !== projectId()) {
    safeDiscard(schemaVersion);
    return { restored: false, changeCount: 0 };
  }

  if (typeof s.mode !== "string" || (s.mode !== "inspect" && s.mode !== "canvas")) {
    safeDiscard(schemaVersion);
    return { restored: false, changeCount: 0 };
  }

  if (!isSameOriginUrl(s.inspectUrl)) {
    safeDiscard(schemaVersion);
    return { restored: false, changeCount: 0 };
  }

  const inspectRouteChanged = s.mode === "inspect" && s.inspectUrl !== window.location.href;

  const cards = Array.isArray(s.cards) ? (s.cards as unknown[]) : null;
  if (!cards) {
    safeDiscard(schemaVersion);
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
      safeDiscard(schemaVersion);
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
    safeDiscard(schemaVersion);
    return { restored: false, changeCount: 0 };
  }

  const cameraRaw = s.camera;
  if (
    !cameraRaw || typeof cameraRaw !== "object" ||
    !isFiniteNumber((cameraRaw as Record<string, unknown>).x) ||
    !isFiniteNumber((cameraRaw as Record<string, unknown>).y) ||
    !isFiniteNumber((cameraRaw as Record<string, unknown>).zoom)
  ) {
    safeDiscard(schemaVersion);
    return { restored: false, changeCount: 0 };
  }

  const changesRaw = Array.isArray(s.changes) ? s.changes : [];
  const deserializedChanges: ChangeRecord[] = [];
  const textChangeIds = new Set<string>();
  for (const c of changesRaw) {
    // A legacy session may contain the former runtime-only preview record. It deliberately
    // has no durable identity, so preserving the rest of the session is safer
    // than attempting to map its generated DOM id onto a new document.
    if (isLegacyRuntimePreview(c)) continue;
    if (c && typeof c === "object" && (c as Record<string, unknown>).kind === "text-content") {
      if (!isTextContentChangeValue(c)
        || textChangeIds.has(c.id)) {
        safeDiscard(schemaVersion);
        return { restored: false, changeCount: 0 };
      }
      textChangeIds.add(c.id);
    }
    if (!isSerializableChange(c)) {
      safeDiscard(schemaVersion);
      return { restored: false, changeCount: 0 };
    }
    try {
      deserializedChanges.push(deserializeChange(c));
    } catch {
      safeDiscard(schemaVersion);
      return { restored: false, changeCount: 0 };
    }
  }

  // v7 added text records on top of the v6 structural schema. Keep the
  // structural snapshot while migrating v7 instead of silently dropping it.
  const structuralChanges = schemaVersion === SCHEMA_VERSION
    || schemaVersion === 7
    || schemaVersion === 6
    ? s.structuralChanges
    : schemaVersion === 5 ? migrateV5StructuralChanges(s.structuralChanges) : [];
  if (!Array.isArray(structuralChanges) || !structuralChanges.every(isStructuralChange)) {
    safeDiscard(schemaVersion);
    return { restored: false, changeCount: 0 };
  }

  const camera: CanvasCamera = {
    x: (cameraRaw as Record<string, unknown>).x as number,
    y: (cameraRaw as Record<string, unknown>).y as number,
    zoom: (cameraRaw as Record<string, unknown>).zoom as number,
  };

  hydrateCanvasStore(s.mode as CanvasMode, serializableCards, camera);
  hydrateStructuralChanges(structuralChanges);
  // Instance evidence captured after a move must resolve against the restored
  // structural order, not the application's pre-move baseline.
  loadChanges(deserializedChanges);
  // A different URL means the user intentionally navigated while Inspect was
  // active. Keep the durable edits, but adopt the new route instead of
  // sending the user back to the previous page. On refresh, the URLs already
  // match and restoration remains unchanged.
  if (inspectRouteChanged || schemaVersion !== SCHEMA_VERSION) {
    const upgraded = persistSessionUnchecked();
    if (upgraded && schemaVersion !== SCHEMA_VERSION) safeDiscard(schemaVersion);
  }
  projectToAllReadyCards();

  return { restored: true, changeCount: deserializedChanges.length + structuralChanges.length };
}

function safeDiscard(schemaVersion = SCHEMA_VERSION): void {
  try {
    localStorage.removeItem(storageKeyForVersion(projectId(), schemaVersion));
  } catch {
    // ignore
  }
}

export function clearSession(): void {
  if (!canWriteWorkspace()) return;
  try {
    localStorage.removeItem(storageKey(projectId()));
    for (const legacyVersion of LEGACY_SCHEMA_VERSIONS) {
      localStorage.removeItem(storageKeyForVersion(projectId(), legacyVersion));
    }
  } catch {
    // ignore
  }

  clearChangesLog();
  clearStructuralChanges();
  resetStructuralDeleteProjection();
  removeManagedSheet();
  setSelectedElement(null);
  clearInspectorLayout();

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
