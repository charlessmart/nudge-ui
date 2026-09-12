import { escapeAttrValue } from "./cssEscapes.ts";
import { isNudgeUiDev } from "../runtime/devFlag.ts";
import { sourceSiteSelector } from "../selection/sourceSite.ts";
import type { TargetResolutionStatus } from "../changes/editModel.ts";

/** A JSX instrumentation site. This is stable across documents. */
export interface SourceSiteRef {
  cid: string;
  src: string;
}

/**
 * Serializable identity for one rendered output. It deliberately contains no
 * DOM reference or generated node id: each document resolves it independently.
 */
export interface RenderedInstanceRef {
  sourceSite: SourceSiteRef;
  locator: {
    kind: "evidence";
    occurrence: number;
    props: string | null;
    text: string | null;
    /** An accessible name can distinguish icon-only repeated controls. */
    ariaLabel?: string | null;
  };
}

export interface RenderedInstanceOverride {
  id: string;
  target: RenderedInstanceRef;
}

export type ResolutionResult =
  | { status: Extract<TargetResolutionStatus, "resolved">; element: HTMLElement }
  | { status: Exclude<TargetResolutionStatus, "resolved"> };

export type DocumentProjectionStatus = "applied" | "missing" | "ambiguous" | "overridden";

export interface DocumentProjectionReport {
  overrideId: string;
  status: DocumentProjectionStatus;
}

export interface RenderedInstanceChangeDiagnostic extends DocumentProjectionReport {
  document: "Inspect" | `Canvas ${string}`;
}

const PROJECTION_ATTR = "data-projection-instance";

interface AppliedProjection {
  override: RenderedInstanceOverride;
  element: HTMLElement | null;
  status: DocumentProjectionStatus;
}

interface DocumentProjectionState {
  applied: Map<string, AppliedProjection>;
  snapshotKey: string | null;
  observer: MutationObserver | null;
  validationQueued: boolean;
}

interface CanvasReports {
  revision: number;
  reports: DocumentProjectionReport[];
}

let nextOverrideId = 1;
let transientTargets = new WeakMap<HTMLElement, RenderedInstanceOverride>();
let canonicalOverrides = new Map<string, RenderedInstanceOverride>();
let reportsByDocument = new WeakMap<Document, DocumentProjectionReport[]>();
const documentStates = new Map<Document, DocumentProjectionState>();
const reportsByCanvasCard = new Map<string, CanvasReports>();
const diagnosticListeners = new Set<() => void>();
let diagnosticRevision = 0;

function normalizedText(el: HTMLElement): string | null {
  return el.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) || null;
}

function candidates(doc: Document, sourceSite: SourceSiteRef): HTMLElement[] {
  const selector = sourceSiteSelector(sourceSite.cid, sourceSite.src);
  if (!selector) return [];
  try {
    return Array.from(doc.querySelectorAll<HTMLElement>(selector));
  } catch {
    return [];
  }
}

/** Captures conservative, serializable identity at the moment of the action. */
export function captureRenderedInstance(el: HTMLElement): RenderedInstanceRef | null {
  const cid = el.getAttribute("data-cid") ?? "";
  const src = el.getAttribute("data-src") ?? "";
  const sourceSite = { cid, src };
  const sourceCandidates = candidates(el.ownerDocument, sourceSite);
  const occurrence = sourceCandidates.indexOf(el);
  if (!cid || occurrence < 0) return null;
  return {
    sourceSite,
    locator: {
      kind: "evidence",
      occurrence,
      props: el.getAttribute("data-cprops"),
      text: normalizedText(el),
      ariaLabel: el.getAttribute("aria-label"),
    },
  };
}

/**
 * Resolves exactly one element, or declines to apply. Occurrence documents the
 * captured placement, but structural previews can legitimately change it.
 * Evidence must therefore identify one current candidate before an edit can
 * be applied.
 */
export function resolveRenderedInstance(doc: Document, ref: RenderedInstanceRef): ResolutionResult {
  const sourceCandidates = candidates(doc, ref.sourceSite);
  const { props, text, ariaLabel = null } = ref.locator;
  // An ordinal alone is not an identity for a repeated source site.
  if (sourceCandidates.length > 1 && props === null && text === null && ariaLabel === null) {
    return { status: "ambiguous" };
  }
  const matchingEvidence = sourceCandidates.filter((element) =>
    element.getAttribute("data-cprops") === props
    && normalizedText(element) === text
    && element.getAttribute("aria-label") === ariaLabel);
  if (matchingEvidence.length === 0) return { status: "missing" };
  // Evidence alone is never enough to choose between two identical rendered
  // outputs. This is particularly important for structural anchors: applying
  // one move to an arbitrary identical parent would reorder the wrong group.
  if (matchingEvidence.length > 1) return { status: "ambiguous" };
  return { status: "resolved", element: matchingEvidence[0]! };
}

/** Checks stable source/evidence fields without treating a post-move ordinal as identity. */
export function matchesRenderedInstanceEvidence(el: HTMLElement, ref: RenderedInstanceRef): boolean {
  const { props, text, ariaLabel = null } = ref.locator;
  return el.getAttribute("data-cid") === ref.sourceSite.cid
    && el.getAttribute("data-src") === ref.sourceSite.src
    && el.getAttribute("data-cprops") === props
    && normalizedText(el) === text
    && el.getAttribute("aria-label") === ariaLabel;
}

/** Builds an instance override without changing the element's transient edit scope. */
export function buildRenderedInstanceOverride(el: HTMLElement): RenderedInstanceOverride | null {
  const target = captureRenderedInstance(el);
  if (!target) return null;
  return buildRenderedInstanceOverrideForTarget(target);
}

/** Creates a serializable override for identity that was already validated. */
export function buildRenderedInstanceOverrideForTarget(target: RenderedInstanceRef): RenderedInstanceOverride {
  return {
    id: `override-${crypto.randomUUID?.() ?? nextOverrideId++}`,
    target,
  };
}

export function createRenderedInstanceOverride(el: HTMLElement): RenderedInstanceOverride | null {
  const override = buildRenderedInstanceOverride(el);
  if (!override) return null;
  transientTargets.set(el, override);
  return override;
}

/** Returns an active transient target or the canonical target projected here. */
export function getRenderedInstanceOverride(el: HTMLElement): RenderedInstanceOverride | null {
  const transient = transientTargets.get(el);
  if (transient) return transient;
  const id = el.getAttribute(PROJECTION_ATTR);
  return id ? canonicalOverrides.get(id) ?? null : null;
}

export function clearRenderedInstanceOverride(el: HTMLElement): RenderedInstanceOverride | null {
  const override = getRenderedInstanceOverride(el);
  transientTargets.delete(el);
  return override;
}

export function instanceSelector(override: RenderedInstanceOverride): string | null {
  const source = sourceSiteSelector(override.target.sourceSite.cid, override.target.sourceSite.src);
  return source ? `${source}[${PROJECTION_ATTR}="${escapeAttrValue(override.id)}"]` : null;
}

/** Extracts the distinct canonical targets which renderers must resolve. */
export function collectRenderedInstanceOverrides(
  changes: ReadonlyArray<unknown>,
): RenderedInstanceOverride[] {
  const result = new Map<string, RenderedInstanceOverride>();
  for (const change of changes) {
    if (!change || typeof change !== "object") continue;
    const candidate = change as { scope?: unknown; instanceOverride?: unknown };
    if (candidate.scope === "rendered-instance" && isRenderedInstanceOverride(candidate.instanceOverride)) {
      result.set(candidate.instanceOverride.id, candidate.instanceOverride);
    }
  }
  return [...result.values()];
}

function notifyDiagnostics(): void {
  diagnosticRevision += 1;
  for (const listener of diagnosticListeners) listener();
}

function sameReports(a: readonly DocumentProjectionReport[], b: readonly DocumentProjectionReport[]): boolean {
  return a.length === b.length && a.every((report, index) =>
    report.overrideId === b[index]?.overrideId && report.status === b[index]?.status);
}

function reportsForSnapshot(state: DocumentProjectionState, overrides: readonly RenderedInstanceOverride[]): DocumentProjectionReport[] {
  return overrides.map((override) => ({
    overrideId: override.id,
    status: state.applied.get(override.id)?.status ?? "missing",
  }));
}

function storeReports(doc: Document, reports: DocumentProjectionReport[]): void {
  const before = reportsByDocument.get(doc) ?? [];
  reportsByDocument.set(doc, reports);
  if (!sameReports(before, reports)) notifyDiagnostics();
}

function validationStatus(doc: Document, applied: AppliedProjection): DocumentProjectionStatus {
  if (applied.status === "overridden") return "overridden";
  if (!applied.element || !applied.element.isConnected
    || applied.element.getAttribute(PROJECTION_ATTR) !== applied.override.id) return "overridden";
  const resolved = resolveRenderedInstance(doc, applied.override.target);
  return resolved.status === "resolved" && resolved.element === applied.element ? "applied" : "overridden";
}

function validateAppliedProjection(doc: Document, state: DocumentProjectionState): void {
  let changed = false;
  for (const applied of state.applied.values()) {
    const status = validationStatus(doc, applied);
    if (status !== applied.status) {
      applied.status = status;
      changed = true;
    }
  }
  if (changed) storeReports(doc, reportsForSnapshot(state, [...canonicalOverrides.values()]));
}

function scheduleValidation(doc: Document, state: DocumentProjectionState): void {
  if (state.validationQueued || state.applied.size === 0) return;
  state.validationQueued = true;
  queueMicrotask(() => {
    state.validationQueued = false;
    validateAppliedProjection(doc, state);
  });
}

function getDocumentState(doc: Document): DocumentProjectionState {
  let state = documentStates.get(doc);
  if (state) return state;
  state = {
    applied: new Map(),
    snapshotKey: null,
    observer: null,
    validationQueued: false,
  };
  const Observer = doc.defaultView?.MutationObserver;
  if (Observer && doc.documentElement) {
    state.observer = new Observer(() => scheduleValidation(doc, state!));
    state.observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-cid", "data-src", "data-cprops", "aria-label", PROJECTION_ATTR],
    });
  }
  documentStates.set(doc, state);
  return state;
}

/**
 * The document-projection adapter only applies a new canonical snapshot. A
 * later reconciliation changes diagnostics but never starts a reapply loop.
 */
export function applyRenderedInstanceProjection(
  doc: Document,
  overrides: ReadonlyArray<RenderedInstanceOverride>,
): DocumentProjectionReport[] {
  if (!isNudgeUiDev()) return [];
  const state = getDocumentState(doc);
  canonicalOverrides = new Map(overrides.map((override) => [override.id, override]));
  const key = JSON.stringify(overrides);
  if (state.snapshotKey === key) {
    const reports = reportsForSnapshot(state, overrides);
    storeReports(doc, reports);
    return reports;
  }

  for (const marker of Array.from(doc.querySelectorAll<HTMLElement>(`[${PROJECTION_ATTR}]`))) {
    marker.removeAttribute(PROJECTION_ATTR);
  }
  state.applied.clear();
  state.snapshotKey = key;
  for (const override of overrides) {
    const resolved = resolveRenderedInstance(doc, override.target);
    if (resolved.status === "resolved") {
      resolved.element.setAttribute(PROJECTION_ATTR, override.id);
      state.applied.set(override.id, { override, element: resolved.element, status: "applied" });
    } else {
      state.applied.set(override.id, { override, element: null, status: resolved.status });
    }
  }
  const reports = reportsForSnapshot(state, overrides);
  storeReports(doc, reports);
  return reports;
}

export function getRenderedInstanceProjectionReports(doc: Document): readonly DocumentProjectionReport[] {
  return reportsByDocument.get(doc) ?? [];
}

/** Diagnostics arrive independently when a renderer reports or React reconciles. */
export function subscribeRenderedInstanceDiagnostics(listener: () => void): () => void {
  diagnosticListeners.add(listener);
  return () => diagnosticListeners.delete(listener);
}

export function getRenderedInstanceDiagnosticRevision(): number {
  return diagnosticRevision;
}

export function recordCanvasRenderedInstanceProjectionReports(
  cardId: string,
  revision: number,
  reports: readonly DocumentProjectionReport[],
): void {
  if (!Number.isSafeInteger(revision) || revision < 0 || !reports.every(isDocumentProjectionReport)) return;
  const expected = new Set(canonicalOverrides.keys());
  if (reports.length !== expected.size || new Set(reports.map((report) => report.overrideId)).size !== reports.length
    || reports.some((report) => !expected.has(report.overrideId))) return;
  const existing = reportsByCanvasCard.get(cardId);
  if (existing && revision < existing.revision) return;
  const next = reports.map((report) => ({ ...report }));
  if (existing && existing.revision === revision && sameReports(existing.reports, next)) return;
  reportsByCanvasCard.set(cardId, { revision, reports: next });
  notifyDiagnostics();
}

export function clearCanvasRenderedInstanceProjectionReports(cardId: string): void {
  if (!reportsByCanvasCard.delete(cardId)) return;
  notifyDiagnostics();
}

export function getRenderedInstanceChangeDiagnostics(overrideId: string): RenderedInstanceChangeDiagnostic[] {
  const diagnostics: RenderedInstanceChangeDiagnostic[] = [];
  const host = reportsByDocument.get(document)?.find((report) => report.overrideId === overrideId);
  if (host) diagnostics.push({ ...host, document: "Inspect" });
  for (const [cardId, entry] of reportsByCanvasCard) {
    const report = entry.reports.find((candidate) => candidate.overrideId === overrideId);
    if (report) diagnostics.push({ ...report, document: `Canvas ${cardId}` });
  }
  return diagnostics;
}

export function isRenderedInstanceRef(value: unknown): value is RenderedInstanceRef {
  if (!value || typeof value !== "object") return false;
  const ref = value as Record<string, unknown>;
  const source = ref.sourceSite as Record<string, unknown> | undefined;
  const locator = ref.locator as Record<string, unknown> | undefined;
  if (!source || typeof source.cid !== "string" || typeof source.src !== "string" || !locator) return false;
  return locator.kind === "evidence"
    && Number.isSafeInteger(locator.occurrence) && (locator.occurrence as number) >= 0
    && (typeof locator.props === "string" || locator.props === null)
    && (typeof locator.text === "string" || locator.text === null)
    && (locator.ariaLabel === undefined || typeof locator.ariaLabel === "string" || locator.ariaLabel === null);
}

export function isRenderedInstanceOverride(value: unknown): value is RenderedInstanceOverride {
  return Boolean(value && typeof value === "object"
    && typeof (value as { id?: unknown }).id === "string"
    && isRenderedInstanceRef((value as { target?: unknown }).target));
}

export function isDocumentProjectionReport(value: unknown): value is DocumentProjectionReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Record<string, unknown>;
  return Object.keys(report).every((key) => key === "overrideId" || key === "status")
    && typeof report.overrideId === "string"
    && (report.status === "applied" || report.status === "missing"
      || report.status === "ambiguous" || report.status === "overridden");
}

/** Test hook for module-local controller state. */
export function resetRenderedInstanceState(): void {
  for (const state of documentStates.values()) state.observer?.disconnect();
  documentStates.clear();
  nextOverrideId = 1;
  transientTargets = new WeakMap();
  canonicalOverrides = new Map();
  reportsByDocument = new WeakMap();
  reportsByCanvasCard.clear();
  diagnosticRevision = 0;
}
