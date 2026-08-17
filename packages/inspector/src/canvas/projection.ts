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
  win.postMessage(msg, window.location.origin);
}

const frameRegistry = new Map<string, HTMLIFrameElement>();
const frameSourceRegistry = new Map<string, HTMLIFrameElement>();

export function registerCardFrameSource(cardId: string, iframe: HTMLIFrameElement): void {
  frameSourceRegistry.set(cardId, iframe);
}

export function registerCardFrame(cardId: string, iframe: HTMLIFrameElement): void {
  frameSourceRegistry.set(cardId, iframe);
  frameRegistry.set(cardId, iframe);
  notifyFrameRegistryListeners();
}

export function unregisterCardFrame(cardId: string): void {
  frameSourceRegistry.delete(cardId);
  frameRegistry.delete(cardId);
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
    win.postMessage(msg, window.location.origin);
  }
}
