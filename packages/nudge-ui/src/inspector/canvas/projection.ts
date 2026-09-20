import { getWorkspaceChanges, type WorkspaceContents } from "../changes/workspaceChanges.ts";
import type { CanvasCard } from "./canvasStore.ts";
import { getCanvasMode } from "./canvasStore.ts";
import { PROTOCOL_VERSION, type ReplaceStylesMessage } from "./frameProtocol.ts";
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
  compileWorkspaceProjection,
  type CompiledManagedStyles,
  type WorkspaceProjectionPlan,
} from "../projection/workspaceProjection.ts";
import { isOriginalPreviewActive } from "../shell/originalPreview.ts";
import { disposeBrowserCssInspection } from "../inspection/browserCssInspectionRegistry.ts";

export const PROJECT_ID = window.location.origin;

export const WORKSPACE_ID = crypto.randomUUID?.() ?? `ws-${Date.now()}`;

let revision = 0;
let lastRulesKey: string | null = null;
let lastPeekActive = false;

interface FrameProjectionState {
  iframe: HTMLIFrameElement;
  document: Document | null;
  previewDocument: PreviewDocument;
  sentRevision: number;
  appliedRevision: number;
  canonicalSentRevision: number;
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

function projectionKey(plan: WorkspaceProjectionPlan<CompiledManagedStyles>): string {
  // Revision ordering protects every controller-owned projection dimension.
  // In particular, a delete-only snapshot has empty CSS but must still advance
  // past the snapshot already accepted by ready Canvas renderers.
  return `${plan.managedStyles.css}\u0000${JSON.stringify(plan.instanceOverrides)}\u0000${JSON.stringify(plan.structuralChanges)}\u0000${JSON.stringify(plan.textContentChanges)}\u0000${JSON.stringify(plan.componentOverrides)}`;
}

export function computeProjection() {
  const plan = compileWorkspaceProjection(getWorkspaceChanges());
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

export function resetProjectionRevision(): void {
  revision = 0;
  lastRulesKey = null;
  lastPeekActive = false;
  for (const state of frameProjectionStates.values()) {
    state.sentRevision = -1;
    state.appliedRevision = -1;
    state.canonicalSentRevision = -1;
  }
  projectionAcknowledgementVersion += 1;
  notifyProjectionAcknowledgementListeners();
}

export function sendProjectionToCard(
  card: CanvasCard,
  iframe: HTMLIFrameElement,
): void {
  const win = iframe.contentWindow;
  if (!win) return;
  const { css, revision: rev, instanceOverrides, structuralChanges, textContentChanges, componentOverrides } = computeProjection();
  sendProjectionMessage(card.id, iframe, rev, css, instanceOverrides, structuralChanges, textContentChanges, componentOverrides, true);
}

function sendProjectionMessage(
  cardId: string,
  iframe: HTMLIFrameElement,
  rev: number,
  css: string,
  instanceOverrides: readonly ReplaceStylesMessage["instanceOverrides"][number][],
  structuralChanges: readonly ReplaceStylesMessage["structuralChanges"][number][],
  textContentChanges: readonly ReplaceStylesMessage["textContentChanges"][number][],
  componentOverrides: readonly ReplaceStylesMessage["componentOverrides"][number][],
  canonical = false,
): void {
  const win = iframe.contentWindow;
  if (!win) return;
  const msg: ReplaceStylesMessage = {
    type: "replace-styles",
    protocolVersion: PROTOCOL_VERSION,
    projectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    cardId,
    css,
    revision: rev,
    instanceOverrides: [...instanceOverrides],
    structuralChanges: [...structuralChanges],
    textContentChanges: [...textContentChanges],
    componentOverrides: [...componentOverrides],
  };
  markProjectionSent(cardId, iframe, rev, canonical);
  win.postMessage(msg, window.location.origin);
}

/** Temporarily projects a snapshot through the renderer that owns the document. */
export async function projectWorkspaceSnapshotToDocument(
  doc: Document,
  snapshot: WorkspaceContents,
): Promise<number | null> {
  const entry = [...frameProjectionStates.entries()].find(([, state]) => state.document === doc);
  if (!entry) return null;
  const [cardId, state] = entry;
  const plan = compileWorkspaceProjection({ ...snapshot, revision: 0 });
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
  );
  if (state.appliedRevision === revision && state.sentRevision === revision) return revision;
  const requestedRevision = revision;
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

const frameRegistry = new Map<string, HTMLIFrameElement>();
const frameSourceRegistry = new Map<string, HTMLIFrameElement>();

export function registerCardFrameSource(cardId: string, iframe: HTMLIFrameElement): void {
  frameSourceRegistry.set(cardId, iframe);
}

export function registerCardFrame(cardId: string, iframe: HTMLIFrameElement): void {
  const frameDocument = getFrameDocument(iframe);
  const existing = frameProjectionStates.get(cardId);
  if (!existing || existing.iframe !== iframe || existing.document !== frameDocument) {
    if (existing) {
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

export function getRegisteredFrames(): ReadonlyMap<string, HTMLIFrameElement> {
  return frameRegistry;
}

export function findCanvasFrameBySource(
  source: MessageEventSource | null,
): { cardId: string; iframe: HTMLIFrameElement } | null {
  for (const [cardId, iframe] of frameSourceRegistry) {
    if (iframe.contentWindow === source) return { cardId, iframe };
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

function getFrameDocument(iframe: HTMLIFrameElement): Document | null {
  try {
    return iframe.contentDocument;
  } catch {
    return null;
  }
}

function markProjectionSent(cardId: string, iframe: HTMLIFrameElement, sentRevision: number, canonical = false): void {
  const state = frameProjectionStates.get(cardId);
  if (!state || state.iframe !== iframe) return;
  state.sentRevision = Math.max(state.sentRevision, sentRevision);
  if (canonical) state.canonicalSentRevision = sentRevision;
}

/** Records the highest complete projection revision accepted by one frame. */
export function recordCanvasProjectionApplied(cardId: string, appliedRevision: number): void {
  const state = frameProjectionStates.get(cardId);
  if (!state || appliedRevision > state.sentRevision || appliedRevision <= state.appliedRevision) return;
  state.appliedRevision = appliedRevision;
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

function notifyFrameRegistryListeners(): void {
  for (const listener of frameRegistryListeners) {
    try { listener(); } catch { /* ignore */ }
  }
}

export function projectToAllReadyCards(): void {
  if (getCanvasMode() !== "canvas") return;
  const { css, revision: rev, instanceOverrides, structuralChanges, textContentChanges, componentOverrides } = computeProjection();
  for (const [cardId, iframe] of frameRegistry) {
    sendProjectionMessage(
      cardId,
      iframe,
      rev,
      css,
      instanceOverrides,
      structuralChanges,
      textContentChanges,
      componentOverrides,
      true,
    );
  }
}
