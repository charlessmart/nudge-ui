import { getPendingRules } from "../changesLog.ts";
import { rulesToCssText } from "../managedStylesheet.ts";
import type { CanvasCard } from "./canvasStore.ts";
import { getCanvasMode } from "./canvasStore.ts";
import { PROTOCOL_VERSION, type ReplaceStylesMessage } from "./frameProtocol.ts";

export const PROJECT_ID = window.location.origin;

export const WORKSPACE_ID = crypto.randomUUID?.() ?? `ws-${Date.now()}`;

let revision = 0;
let lastRulesKey: string | null = null;

function rulesKey(css: string): string {
  const rules = getPendingRules();
  if (rules.length === 0) return "__empty__";
  return css;
}

export function computeProjection(): { css: string; revision: number } {
  const rules = getPendingRules();
  const css = rulesToCssText(rules);
  const key = rulesKey(css);
  if (key !== lastRulesKey) {
    lastRulesKey = key;
    revision += 1;
  }
  return { css, revision };
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
  const { css, revision: rev } = computeProjection();
  const msg: ReplaceStylesMessage = {
    type: "replace-styles",
    protocolVersion: PROTOCOL_VERSION,
    projectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    cardId: card.id,
    css,
    revision: rev,
  };
  win.postMessage(msg, window.location.origin);
}

const frameRegistry = new Map<string, HTMLIFrameElement>();

export function registerCardFrame(cardId: string, iframe: HTMLIFrameElement): void {
  frameRegistry.set(cardId, iframe);
}

export function unregisterCardFrame(cardId: string): void {
  frameRegistry.delete(cardId);
}

export function projectToAllReadyCards(): void {
  if (getCanvasMode() !== "canvas") return;
  const { css, revision: rev } = computeProjection();
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
    };
    win.postMessage(msg, window.location.origin);
  }
}
