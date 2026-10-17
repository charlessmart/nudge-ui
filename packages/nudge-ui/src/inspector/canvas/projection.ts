import type { CanvasFrame } from "./canvasFrame.ts";
import { draftIdForCard, getDraftChanges, getActiveDraftChanges } from "../drafts/store.ts";
import type { DraftContents } from "../drafts/model.ts";
import type { CanvasCard } from "./canvasStore.ts";
import { getCanvasCards } from "./canvasStore.ts";
import { getCanvasMode } from "./viewStore.ts";
import type { ReplaceStylesMessage } from "./frameProtocol.ts";
import { connectFrame } from "./frameConnection.ts";
import { clearCanvasRenderedInstanceProjectionReports } from "../projection/renderedInstance.ts";
import { clearCanvasTextProjectionReports } from "../projection/textProjection.ts";
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
  sentCss: Map<number, string>;
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

export function getCanvasPreviewDocument(cardId: string): PreviewDocument {
  // Pure getter: registerCardFrame owns session activation; creating the identity here is idempotent.
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

/** Re-sends the canonical projection and settles on acknowledgement, so callers can rely on its stylesheet invalidation. */
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

/** Resolves with `requestedRevision` on acknowledgement; null when superseded, replaced, or after 2s. */
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

/** Whether an acknowledged temporary projection is still authoritative. */
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

/** The registered frame rendering `doc`; on the page surface this is the controller document. */
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

export function recordCanvasProjectionApplied(cardId: string, appliedRevision: number): void {
  const state = frameProjectionStates.get(cardId);
  if (!state || appliedRevision > state.sentRevision || appliedRevision <= state.appliedRevision) return;
  state.appliedRevision = appliedRevision;
  const css = state.sentCss.get(appliedRevision);
  for (const sent of state.sentCss.keys()) {
    if (sent <= appliedRevision) state.sentCss.delete(sent);
  }
  // Renderer stylesheet writes don't invalidate the controller's CSSOM cache, so only a CSS change needs a refresh.
  const cssChanged = css === undefined || css !== state.appliedCss;
  state.appliedCss = css ?? null;
  if (cssChanged && state.document && state.iframe.contentDocument === state.document) {
    notifyBrowserStylesheetChange(state.document);
  }
  projectionAcknowledgementVersion += 1;
  notifyProjectionAcknowledgementListeners();
}

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

/** Bumped whenever a frame registers or unregisters, for `useSyncExternalStore`. */
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
