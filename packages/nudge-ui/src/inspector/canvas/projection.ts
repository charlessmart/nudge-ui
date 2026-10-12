import type { CanvasFrame } from "./canvasFrame.ts";
import { draftIdForCard, getDraftChanges, getActiveDraftChanges } from "../drafts/store.ts";
import type { DraftContents } from "../drafts/model.ts";
import type { CanvasCard } from "./canvasStore.ts";
import { getCanvasCards } from "./canvasStore.ts";
import { getCanvasMode } from "./viewStore.ts";
import type { ReplaceStylesMessage } from "./frameProtocol.ts";
import { connectFrame } from "./frameConnection.ts";
import {
  clearCanvasRenderedInstanceProjectionReports,
  setCanonicalRenderedInstanceOverrides,
} from "../projection/renderedInstance.ts";
import {
  clearCanvasTextProjectionReports,
  setCanonicalTextContentChanges,
} from "../projection/textProjection.ts";
import { clearCanvasStructuralProjectionReports } from "../projection/structuralProjection.ts";
import {
  invalidatePreviewDocumentSession,
  startPreviewDocumentSession,
  type PreviewDocument,
} from "../changes/previewDiagnostics.ts";
import {
  compileDraftProjection,
  type CompiledManagedStyles,
  type DraftProjectionPlan,
} from "../projection/draftProjection.ts";
import { isOriginalPreviewActive } from "../shell/originalPreview.ts";
import { disposeBrowserCssInspection, notifyBrowserStylesheetChange } from "../inspection/browserCssInspectionRegistry.ts";

let revision = 0;
let lastRulesKey: string | null = null;
let lastPeekActive = false;
export interface FrameProjection extends DraftProjectionPlan<CompiledManagedStyles> {
  readonly draftId: string;
  readonly draftRevision: number;
  readonly revision: number;
  readonly css: string;
}

const draftPlans = new Map<string, { peek: boolean; plan: FrameProjection }>();

interface FrameProjectionState {
  iframe: CanvasFrame;
  document: Document | null;
  previewDocument: PreviewDocument;
  sentRevision: number;
  appliedRevision: number;
  canonicalSentRevision: number;
  canonicalProjection: FrameProjection | null;
  /** Managed CSS of each sent revision not yet acknowledged. */
  sentCss: Map<number, string>;
  /** Managed CSS of the applied revision, or null before the first one. */
  appliedCss: string | null;
}

export interface CanvasProjectionStatus {
  sentRevision: number;
  appliedRevision: number;
}

const frameProjectionStates = new Map<string, FrameProjectionState>();
const previewDocuments = new Map<string, PreviewDocument>();
const projectionAcknowledgementListeners = new Set<() => void>();
let projectionAcknowledgementVersion = 0;
let nextPreviewSessionId = 1;

function createPreviewDocumentIdentity(cardId: string): PreviewDocument {
  const previewDocument = {
    logicalDocument: `canvas:${cardId}`,
    sessionId: `canvas-session-${nextPreviewSessionId++}`,
    draftId: draftIdForCard(cardId) ?? getActiveDraftChanges().draftId,
  };
  previewDocuments.set(cardId, previewDocument);
  return previewDocument;
}

/** Returns the current value-based identity for one Canvas card document. */
export function getCanvasPreviewDocument(cardId: string): PreviewDocument {
  // Pure getter: no session activation or notify. Creation (identity only) is
  // idempotent here; registerCardFrame owns session activation.
  return previewDocuments.get(cardId) ?? createPreviewDocumentIdentity(cardId);
}

/** Invalidates a card's current document before its iframe is replaced. */
export function invalidateCanvasPreviewDocument(cardId: string): void {
  const state = frameProjectionStates.get(cardId);
  if (state?.document) disposeBrowserCssInspection(state.document);
  const previewDocument = previewDocuments.get(cardId);
  if (!previewDocument) return;
  invalidatePreviewDocumentSession(previewDocument.logicalDocument, previewDocument.sessionId);
  previewDocuments.delete(cardId);
}

function projectionKey(plan: DraftProjectionPlan<CompiledManagedStyles>): string {
  // Revision ordering protects every controller-owned projection dimension.
  // In particular, a delete-only snapshot has empty CSS but must still advance
  // past the snapshot already accepted by ready Canvas renderers.
  return `${plan.managedStyles.css}\u0000${JSON.stringify(plan.instanceOverrides)}\u0000${JSON.stringify(plan.structuralChanges)}\u0000${JSON.stringify(plan.textContentChanges)}\u0000${JSON.stringify(plan.componentOverrides)}`;
}

export function computeProjection() {
  const plan = compileDraftProjection(getActiveDraftChanges());
  if (isOriginalPreviewActive()) {
    // Hold-to-view-original: frames show the page without inspector changes
    // while canonical intent (and its projection key) stays untouched.
    if (!lastPeekActive) {
      lastPeekActive = true;
      revision += 1;
    }
    return {
      ...plan,
      managedStyles: { rules: [], css: "" },
      css: "",
      instanceOverrides: [],
      structuralChanges: [],
      textContentChanges: [],
      componentOverrides: [],
      revision,
    };
  }
  if (lastPeekActive) {
    // Force the canonical projection to resend after a peek even though its
    // key is unchanged since the peek began.
    lastPeekActive = false;
    lastRulesKey = null;
  }
  setCanonicalRenderedInstanceOverrides(plan.instanceOverrides);
  setCanonicalTextContentChanges(plan.textContentChanges);
  const key = projectionKey(plan);
  if (key !== lastRulesKey) {
    lastRulesKey = key;
    revision += 1;
  }
  return { ...plan, css: plan.managedStyles.css, revision };
}

export function computeProjectionForCard(cardId: string): FrameProjection {
  const draftId = draftIdForCard(cardId);
  const workspace = draftId ? getDraftChanges(draftId) : getActiveDraftChanges();
  const peek = isOriginalPreviewActive();
  const cached = draftPlans.get(workspace.draftId);
  if (cached && cached.plan.draftRevision === workspace.revision && cached.peek === peek) return cached.plan;
  const source = peek ? { ...workspace, changes: [], structuralChanges: [] } : workspace;
  const compiled = compileDraftProjection(source);
  const plan: FrameProjection = { ...compiled, draftId: workspace.draftId, draftRevision: workspace.revision, css: compiled.managedStyles.css, revision: ++revision };
  draftPlans.set(workspace.draftId, { peek, plan });
  return plan;
}

export function getCanonicalFrameProjection(cardId: string, expectedRevision: number): FrameProjection | null {
  const state = frameProjectionStates.get(cardId);
  const plan = state?.canonicalProjection;
  const draftId = draftIdForCard(cardId);
  const draft = draftId ? getDraftChanges(draftId) : null;
  if (!state || !previewDocuments.has(cardId) || state.iframe.contentDocument !== state.document
    || !plan || plan.revision !== expectedRevision || state.sentRevision !== expectedRevision
    || (draft && (draft.draftId !== plan.draftId || draft.revision !== plan.draftRevision))) return null;
  return plan;
}

/**
 * Re-sends the canonical projection after a temporary verification projection
 * and settles once the renderer acknowledges it, so callers can treat the
 * acknowledgement's stylesheet invalidation as part of their own work.
 */
export async function restoreCanonicalFrameProjection(doc: Document): Promise<void> {
  const id = getCanvasCardIdForDocument(doc);
  const card = getCanvasCards().find((card) => card.id === id);
  const frame = id ? frameRegistry.get(id) : undefined;
  if (!card || !frame) return;
  const sent = sendProjectionToCard(card, frame);
  if (sent !== null) await waitForProjectionApplied(card.id, doc, sent);
}

export function getCanvasCardIdForDocument(doc: Document): string | null {
  for (const [id, state] of frameProjectionStates) if (state.document === doc && state.iframe.contentDocument === doc) return id;
  return null;
}

export function resetProjectionRevision(): void {
  revision = 0;
  lastRulesKey = null;
  lastPeekActive = false;
  draftPlans.clear();
  for (const state of frameProjectionStates.values()) {
    state.sentRevision = -1;
    state.appliedRevision = -1;
    state.canonicalSentRevision = -1;
    state.canonicalProjection = null;
  }
  projectionAcknowledgementVersion += 1;
  notifyProjectionAcknowledgementListeners();
}

/** Sends the canonical projection and returns its revision, or null when the frame has no window. */
export function sendProjectionToCard(
  card: Pick<CanvasCard, "id">,
  iframe: CanvasFrame,
): number | null {
  const win = iframe.contentWindow;
  if (!win) return null;
  let plan = computeProjectionForCard(card.id);
  const state = frameProjectionStates.get(card.id);
  if (state && plan.revision < state.sentRevision) {
    plan = { ...plan, revision: ++revision };
    draftPlans.set(plan.draftId, { peek: isOriginalPreviewActive(), plan });
  }
  if (state) state.canonicalProjection = plan;
  const { css, revision: rev, instanceOverrides, structuralChanges, textContentChanges, componentOverrides, runtimeIdentities } = plan;
  sendProjectionMessage(card.id, iframe, rev, css, instanceOverrides, structuralChanges, textContentChanges, componentOverrides, runtimeIdentities, true);
  return rev;
}

function sendProjectionMessage(
  cardId: string,
  iframe: CanvasFrame,
  rev: number,
  css: string,
  instanceOverrides: readonly ReplaceStylesMessage["instanceOverrides"][number][],
  structuralChanges: readonly ReplaceStylesMessage["structuralChanges"][number][],
  textContentChanges: readonly ReplaceStylesMessage["textContentChanges"][number][],
  componentOverrides: readonly ReplaceStylesMessage["componentOverrides"][number][],
  runtimeIdentities: DraftProjectionPlan<CompiledManagedStyles>["runtimeIdentities"],
  canonical = false,
): void {
  if (!iframe.contentWindow) return;
  markProjectionSent(cardId, iframe, rev, css, canonical);
  connectFrame(cardId, iframe).post({
    type: "replace-styles",
    css,
    revision: rev,
    instanceOverrides: [...instanceOverrides],
    structuralChanges: [...structuralChanges],
    textContentChanges: [...textContentChanges],
    componentOverrides: [...componentOverrides],
    ...(runtimeIdentities ? { runtimeIdentities: [...runtimeIdentities] } : {}),
  });
}

/** Temporarily projects a snapshot through the renderer that owns the document. */
export async function projectDraftToDocument(
  doc: Document,
  snapshot: DraftContents,
): Promise<number | null> {
  const entry = [...frameProjectionStates.entries()].find(([, state]) => state.document === doc);
  if (!entry) return null;
  const [cardId, state] = entry;
  const plan = compileDraftProjection({ ...snapshot, revision: 0 });
  revision += 1;
  sendProjectionMessage(
    cardId,
    state.iframe,
    revision,
    plan.managedStyles.css,
    plan.instanceOverrides,
    plan.structuralChanges,
    plan.textContentChanges,
    plan.componentOverrides,
    plan.runtimeIdentities,
  );
  return waitForProjectionApplied(cardId, doc, revision);
}

/**
 * Resolves with `requestedRevision` once the frame acknowledges it, or null
 * when a newer projection supersedes it, the frame is replaced, or 2s pass.
 */
function waitForProjectionApplied(
  cardId: string,
  doc: Document,
  requestedRevision: number,
): Promise<number | null> {
  const initial = frameProjectionStates.get(cardId);
  if (initial?.appliedRevision === requestedRevision && initial.sentRevision === requestedRevision) {
    return Promise.resolve(requestedRevision);
  }
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (appliedRevision: number | null): void => {
      if (settled) return;
      settled = true;
      unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
      resolve(appliedRevision);
    };
    const unsubscribe = subscribeCanvasProjectionAcknowledgements(() => {
      const current = frameProjectionStates.get(cardId);
      if (!current || current.document !== doc) finish(null);
      else if (current.sentRevision > requestedRevision || current.appliedRevision > requestedRevision) finish(null);
      else if (current.appliedRevision === requestedRevision) finish(requestedRevision);
    });
    timer = setTimeout(() => finish(null), 2_000);
  });
}

/** Returns whether an acknowledged temporary projection is still authoritative. */
export function isCanvasProjectionRevisionCurrent(doc: Document, expectedRevision: number): boolean {
  for (const state of frameProjectionStates.values()) {
    if (state.document !== doc) continue;
    try {
      if (state.iframe.contentDocument !== doc) return false;
    } catch {
      return false;
    }
    return state.sentRevision === expectedRevision && state.appliedRevision === expectedRevision;
  }
  return false;
}

/** Returns whether the live frame acknowledged its latest canonical workspace projection. */
export function isCanvasCanonicalProjectionRevisionCurrent(doc: Document, expectedRevision: number): boolean {
  for (const state of frameProjectionStates.values()) {
    if (state.document !== doc) continue;
    try {
      if (state.iframe.contentDocument !== doc) return false;
    } catch {
      return false;
    }
    return state.canonicalSentRevision === expectedRevision
      && state.sentRevision === expectedRevision
      && state.appliedRevision === expectedRevision;
  }
  return false;
}

const frameRegistry = new Map<string, CanvasFrame>();
const frameSourceRegistry = new Map<string, CanvasFrame>();

export function registerCardFrameSource(cardId: string, iframe: CanvasFrame): void {
  frameSourceRegistry.set(cardId, iframe);
}

export function registerCardFrame(cardId: string, iframe: CanvasFrame): void {
  const frameDocument = getFrameDocument(iframe);
  const existing = frameProjectionStates.get(cardId);
  if (!existing || existing.iframe !== iframe || existing.document !== frameDocument) {
    if (existing) {
      if (existing.canonicalProjection) draftPlans.delete(existing.canonicalProjection.draftId);
      invalidatePreviewDocumentSession(existing.previewDocument.logicalDocument, existing.previewDocument.sessionId);
      previewDocuments.delete(cardId);
    }
    const previewDocument = previewDocuments.get(cardId) ?? createPreviewDocumentIdentity(cardId);
    startPreviewDocumentSession(previewDocument);
    frameProjectionStates.set(cardId, {
      iframe,
      document: frameDocument,
      previewDocument,
      sentRevision: -1,
      appliedRevision: -1,
      canonicalSentRevision: -1,
      canonicalProjection: null,
      sentCss: new Map(),
      appliedCss: null,
    });
  } else {
    startPreviewDocumentSession(existing.previewDocument);
  }
  frameSourceRegistry.set(cardId, iframe);
  frameRegistry.set(cardId, iframe);
  notifyFrameRegistryListeners();
}

export function unregisterCardFrame(cardId: string): void {
  frameSourceRegistry.delete(cardId);
  frameRegistry.delete(cardId);
  invalidateCanvasPreviewDocument(cardId);
  frameProjectionStates.delete(cardId);
  projectionAcknowledgementVersion += 1;
  notifyProjectionAcknowledgementListeners();
  clearCanvasStructuralProjectionReports(cardId);
  clearCanvasRenderedInstanceProjectionReports(cardId);
  clearCanvasTextProjectionReports(cardId);
  notifyFrameRegistryListeners();
}

export function getRegisteredFrames(): ReadonlyMap<string, CanvasFrame> {
  return frameRegistry;
}

export function findCanvasFrameBySource(
  source: MessageEventSource | null,
): { cardId: string; iframe: CanvasFrame } | null {
  for (const [cardId, iframe] of frameSourceRegistry) {
    if (iframe.contentWindow === source) return { cardId, iframe };
  }
  return null;
}

/** The registered frame rendering `doc`, which may be the controller document on the page surface. */
export function findCanvasFrameByDocument(doc: Document | null | undefined): CanvasFrame | null {
  if (!doc) return null;
  for (const iframe of frameRegistry.values()) {
    if (getFrameDocument(iframe) === doc) return iframe;
  }
  return null;
}

const frameRegistryListeners = new Set<() => void>();

export function subscribeFrameRegistry(listener: () => void): () => void {
  frameRegistryListeners.add(listener);
  return () => {
    frameRegistryListeners.delete(listener);
  };
}

function getFrameDocument(iframe: CanvasFrame): Document | null {
  try {
    return iframe.contentDocument;
  } catch {
    return null;
  }
}

function markProjectionSent(cardId: string, iframe: CanvasFrame, sentRevision: number, css: string, canonical = false): void {
  const state = frameProjectionStates.get(cardId);
  if (!state || state.iframe !== iframe) return;
  state.sentRevision = Math.max(state.sentRevision, sentRevision);
  state.sentCss.set(sentRevision, css);
  if (canonical) state.canonicalSentRevision = sentRevision;
}

/** Records the highest complete projection revision accepted by one frame. */
export function recordCanvasProjectionApplied(cardId: string, appliedRevision: number): void {
  const state = frameProjectionStates.get(cardId);
  if (!state || appliedRevision > state.sentRevision || appliedRevision <= state.appliedRevision) return;
  state.appliedRevision = appliedRevision;
  const css = state.sentCss.get(appliedRevision);
  for (const sent of state.sentCss.keys()) {
    if (sent <= appliedRevision) state.sentCss.delete(sent);
  }
  // Adopted stylesheet writes in the renderer do not emit DOM mutations or
  // invalidate the controller's separate CSSOM cache. Structural and text
  // projections leave the CSS unchanged, so they need no stylesheet refresh.
  const cssChanged = css === undefined || css !== state.appliedCss;
  state.appliedCss = css ?? null;
  if (cssChanged && state.document && state.iframe.contentDocument === state.document) {
    notifyBrowserStylesheetChange(state.document);
  }
  projectionAcknowledgementVersion += 1;
  notifyProjectionAcknowledgementListeners();
}

/** Returns projection progress for the document containing a selected element. */
export function getCanvasProjectionStatus(doc: Document): CanvasProjectionStatus | null {
  for (const state of frameProjectionStates.values()) {
    if (state.document !== doc) continue;
    return {
      sentRevision: state.sentRevision,
      appliedRevision: state.appliedRevision,
    };
  }
  return null;
}

export function subscribeCanvasProjectionAcknowledgements(listener: () => void): () => void {
  projectionAcknowledgementListeners.add(listener);
  return () => {
    projectionAcknowledgementListeners.delete(listener);
  };
}

export function getCanvasProjectionAcknowledgementVersion(): number {
  return projectionAcknowledgementVersion;
}

function notifyProjectionAcknowledgementListeners(): void {
  for (const listener of projectionAcknowledgementListeners) {
    try { listener(); } catch { /* ignore */ }
  }
}

let frameRegistryVersion = 0;

/** Changes whenever a frame registers or unregisters, for `useSyncExternalStore`. */
export function getFrameRegistryVersion(): number {
  return frameRegistryVersion;
}

function notifyFrameRegistryListeners(): void {
  frameRegistryVersion += 1;
  for (const listener of frameRegistryListeners) {
    try { listener(); } catch { /* ignore */ }
  }
}

export function projectToAllReadyCards(): void {
  if (getCanvasMode() !== "canvas") return;
  for (const [id, iframe] of frameRegistry) sendProjectionToCard({ id }, iframe);
}
