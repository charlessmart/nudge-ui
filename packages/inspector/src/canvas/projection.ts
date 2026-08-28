import { getChangesList, getPendingRules } from "../changesLog.ts";
import { rulesToCssText } from "../managedStylesheet.ts";
import type { CanvasCard } from "./canvasStore.ts";
import { getCanvasMode } from "./canvasStore.ts";
import { PROTOCOL_VERSION, type ReplaceStylesMessage } from "./frameProtocol.ts";
import { isComponentChange } from "../changes/types.ts";
import { componentChangeToOverride } from "../componentSemantics/changeModel.ts";
import {
  applyRenderedInstanceProjection,
  clearCanvasRenderedInstanceProjectionReports,
  collectRenderedInstanceOverrides,
} from "../renderedInstance.ts";
import {
  applyTextContentProjection,
  clearCanvasTextProjectionReports,
  collectTextContentChanges,
} from "../textProjection.ts";
import { applyStructuralProjection, getStructuralChanges } from "../structuralProjection.ts";
import { clearCanvasStructuralProjectionReports } from "../structuralProjection.ts";

export const PROJECT_ID = window.location.origin;

export const WORKSPACE_ID = crypto.randomUUID?.() ?? `ws-${Date.now()}`;

let revision = 0;
let lastRulesKey: string | null = null;

interface FrameProjectionState {
  iframe: HTMLIFrameElement;
  document: Document | null;
  sentRevision: number;
  appliedRevision: number;
}

export interface CanvasProjectionStatus {
  sentRevision: number;
  appliedRevision: number;
}

const frameProjectionStates = new Map<string, FrameProjectionState>();
const projectionAcknowledgementListeners = new Set<() => void>();
let projectionAcknowledgementVersion = 0;

function rulesKey(
  css: string,
  overrides: ReturnType<typeof collectRenderedInstanceOverrides>,
  textContentChanges: ReturnType<typeof collectTextContentChanges>,
  componentOverrides: ReturnType<typeof componentChangeToOverride>[],
): string {
  // Revision ordering protects every controller-owned projection dimension.
  // In particular, a delete-only snapshot has empty CSS but must still advance
  // past the snapshot already accepted by ready Canvas renderers.
  return `${css}\u0000${JSON.stringify(overrides)}\u0000${JSON.stringify(getStructuralChanges())}\u0000${JSON.stringify(textContentChanges)}\u0000${JSON.stringify(componentOverrides)}`;
}

export function computeProjection() {
  const structuralChanges = getStructuralChanges();
  applyStructuralProjection(document, structuralChanges);
  const overrides = collectRenderedInstanceOverrides(getChangesListForProjection());
  applyRenderedInstanceProjection(document, overrides);
  const textContentChanges = collectTextContentChanges(getChangesListForProjection());
  const componentOverrides = getChangesListForProjection()
    .filter(isComponentChange)
    .map(componentChangeToOverride)
    .filter((override): override is NonNullable<ReturnType<typeof componentChangeToOverride>> => override !== null);
  applyTextContentProjection(document, textContentChanges);
  const rules = getPendingRules();
  const css = rulesToCssText(rules);
  const key = rulesKey(css, overrides, textContentChanges, componentOverrides);
  if (key !== lastRulesKey) {
    lastRulesKey = key;
    revision += 1;
  }
  return { css, revision, instanceOverrides: overrides, structuralChanges, textContentChanges, componentOverrides };
}

// Kept private to projection so callers cannot accidentally make a renderer
// authoritative over the controller change log.
function getChangesListForProjection() {
  // getPendingRules intentionally hides canonical metadata; projection needs
  // the durable instance references in addition to its CSS serialization.
  return getChangesList();
}

export function resetProjectionRevision(): void {
  revision = 0;
  lastRulesKey = null;
  for (const state of frameProjectionStates.values()) {
    state.sentRevision = -1;
    state.appliedRevision = -1;
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
  const msg: ReplaceStylesMessage = {
    type: "replace-styles",
    protocolVersion: PROTOCOL_VERSION,
    projectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    cardId: card.id,
    css,
    revision: rev,
    instanceOverrides,
    structuralChanges: [...structuralChanges],
    textContentChanges: [...textContentChanges],
    componentOverrides: [...componentOverrides],
  };
  markProjectionSent(card.id, iframe, rev);
  win.postMessage(msg, window.location.origin);
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
    frameProjectionStates.set(cardId, {
      iframe,
      document: frameDocument,
      sentRevision: -1,
      appliedRevision: -1,
    });
  }
  frameSourceRegistry.set(cardId, iframe);
  frameRegistry.set(cardId, iframe);
  notifyFrameRegistryListeners();
}

export function unregisterCardFrame(cardId: string): void {
  frameSourceRegistry.delete(cardId);
  frameRegistry.delete(cardId);
  frameProjectionStates.delete(cardId);
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

function markProjectionSent(cardId: string, iframe: HTMLIFrameElement, sentRevision: number): void {
  const state = frameProjectionStates.get(cardId);
  if (!state || state.iframe !== iframe) return;
  state.sentRevision = Math.max(state.sentRevision, sentRevision);
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
    const win = iframe.contentWindow;
    if (!win) continue;
    const msg: ReplaceStylesMessage = {
      type: "replace-styles",
      protocolVersion: PROTOCOL_VERSION,
      projectId: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      cardId,
      css,
      revision: rev,
      instanceOverrides,
      structuralChanges: [...structuralChanges],
      textContentChanges: [...textContentChanges],
      componentOverrides: [...componentOverrides],
    };
    markProjectionSent(cardId, iframe, rev);
    win.postMessage(msg, window.location.origin);
  }
}
