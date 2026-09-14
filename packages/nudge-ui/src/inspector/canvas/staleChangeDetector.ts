import type {
  ChangeRecord,
  PreviewableChangeRecord,
  TokenChangeRecord,
} from "../changes/changesLog.ts";
import {
  isPreviewableChange,
  isTokenChange,
} from "../changes/changesLog.ts";
import { changeKey } from "../changes/model.ts";
import {
  beginPreviewAttempt,
  clearPreviewDiagnostics,
  getHostPreviewDocument,
  notifyPreviewDiagnostics,
  publishPreviewDiagnostic,
  type PreviewAttempt,
  type PreviewDocument,
} from "../changes/previewDiagnostics.ts";
import { getWorkspaceChanges } from "../changes/workspaceChanges.ts";
import type { PreviewResult } from "../projection/managedStylesheet.ts";
import { getCanvasPreviewDocument, getRegisteredFrames } from "./projection.ts";
import { findCanvasFrameBySource, PROJECT_ID, WORKSPACE_ID } from "./projection.ts";
import { getCanvasCards } from "./canvasStore.ts";
import { isRendererMessageFor } from "./frameProtocol.ts";
import type { TokenDefinition } from "../../css/model/index.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";

const VERIFICATION_TIMEOUT_MS = 5000;
const STALE_CHECK_DEBOUNCE_MS = 100;

let verificationTimer: ReturnType<typeof setTimeout> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingChanges: PreviewableChangeRecord[] | null = null;
let pendingAttempts = new Map<string, PreviewAttempt>();

export type StaleChangeStatus = "unverified" | "verified" | "stale" | "token-drift";

export interface StaleChangeInfo {
  index: number;
  status: StaleChangeStatus;
  matchedRoutes: string[];
  driftMessage?: string;
}

function checkSelectorInDocument(doc: Document, selector: string): boolean {
  try {
    return doc.querySelectorAll(selector).length > 0;
  } catch {
    return false;
  }
}

function checkSelectorInFrame(iframe: HTMLIFrameElement, selector: string): boolean {
  try {
    const doc = iframe.contentDocument;
    if (!doc) return false;
    return checkSelectorInDocument(doc, selector);
  } catch {
    return false;
  }
}

function getRequestedValue(change: PreviewableChangeRecord): string {
  if (isTokenChange(change)) return change.rawValue;
  if (change.newToken) {
    return change.newToken.cssValue ?? `var(${change.newToken.cssName ?? change.newToken.name})`;
  }
  return change.rawValue ?? "";
}

function buildStaleResult(selector: string, requestedValue: string): PreviewResult {
  return {
    requestedValue,
    computedValue: "",
    status: "conflict",
    reason: "target-missing",
  };
}

function checkTokenDrift(change: TokenChangeRecord): PreviewResult | null {
  const { tokenCatalog } = getNudgeUiRuntimeConfig();
  const def: TokenDefinition | undefined = tokenCatalog.find(
    (d) => d.name === change.tokenName || d.cssName === change.tokenName,
  );
  if (!def) {
    return {
      requestedValue: change.rawValue,
      computedValue: "",
      status: "conflict",
      reason: "token-drift",
    };
  }

  const primaryDecl = def.declarations[0];
  if (!primaryDecl) {
    return {
      requestedValue: change.rawValue,
      computedValue: "",
      status: "conflict",
      reason: "token-drift",
    };
  }

  if (primaryDecl.value !== change.oldRawValue) {
    return {
      requestedValue: change.rawValue,
      computedValue: primaryDecl.value,
      status: "conflict",
      reason: "token-drift",
    };
  }

  return null;
}

function getPreviewDocuments(): PreviewDocument[] {
  const documents = [getHostPreviewDocument()];
  const frames = getRegisteredFrames();
  for (const card of getCanvasCards()) {
    if (frames.has(card.id)) documents.push(getCanvasPreviewDocument(card.id));
  }
  return documents;
}

function beginPreviewAttempts(): Map<string, PreviewAttempt> {
  const attempts = new Map<string, PreviewAttempt>();
  const revision = getWorkspaceChanges().revision;
  for (const document of getPreviewDocuments()) {
    const attempt = beginPreviewAttempt(document, revision);
    if (attempt) attempts.set(document.logicalDocument, attempt);
  }
  return attempts;
}

function gatherMatchEvidence(
  changes: PreviewableChangeRecord[],
): Map<number, PreviewDocument[]> {
  const evidence = new Map<number, PreviewDocument[]>();
  const hostDocument = getHostPreviewDocument();

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]!;
    if (isTokenChange(change)) continue;

    if (checkSelectorInDocument(document, change.selector)) {
      const routes = evidence.get(i) ?? [];
      routes.push(hostDocument);
      evidence.set(i, routes);
    }
  }

  const frames = getRegisteredFrames();
  const cards = getCanvasCards();
  for (const card of cards) {
    const frame = frames.get(card.id);
    if (!frame || !frame.contentWindow) continue;
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i]!;
      if (isTokenChange(change)) continue;

      if (checkSelectorInFrame(frame, change.selector)) {
        const routes = evidence.get(i) ?? [];
        routes.push(getCanvasPreviewDocument(card.id));
        evidence.set(i, routes);
      }
    }
  }

  return evidence;
}

function applyStaleResults(
  changes: PreviewableChangeRecord[],
  attempts: ReadonlyMap<string, PreviewAttempt>,
): void {
  const evidence = gatherMatchEvidence(changes);
  const hostAttempt = attempts.get(getHostPreviewDocument().logicalDocument);

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]!;

    if (isTokenChange(change)) {
      const drift = checkTokenDrift(change);
      if (drift && hostAttempt) publishPreviewDiagnostic(hostAttempt, changeKey(change), drift);
      continue;
    }
    const routes = evidence.get(i);
    // A document that does not contain the target says nothing about
    // staleness. Publish target-missing only when the change matches nowhere;
    // a Canvas-only match is verified, not a host conflict. When nowhere,
    // every live document reports the same miss.
    if (!routes || routes.length === 0) {
      for (const attempt of attempts.values()) {
        publishPreviewDiagnostic(attempt, changeKey(change), buildStaleResult(
          change.selector,
          getRequestedValue(change),
        ));
      }
    }
  }
}

function scheduleStaleCheck(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (pendingChanges) {
      pendingAttempts = beginPreviewAttempts();
      clearPreviewDiagnostics(pendingChanges.map(changeKey));
      applyStaleResults(pendingChanges, pendingAttempts);
    }
  }, STALE_CHECK_DEBOUNCE_MS);
}

export function startStaleDetection(changes: ChangeRecord[]): void {
  const previewableChanges = changes.filter(isPreviewableChange);
  if (previewableChanges.length === 0) return;

  clearPreviewDiagnostics(previewableChanges.map(changeKey));
  pendingAttempts = beginPreviewAttempts();

  pendingChanges = previewableChanges;

  if (verificationTimer) clearTimeout(verificationTimer);
  verificationTimer = setTimeout(() => {
    if (pendingChanges) {
      applyStaleResults(pendingChanges, pendingAttempts);
      pendingChanges = null;
    }
    pendingAttempts = new Map();
    verificationTimer = null;
    notifyPreviewDiagnostics();
  }, VERIFICATION_TIMEOUT_MS);

  window.addEventListener("message", handleFrameReady);
}

function handleFrameReady(event: MessageEvent): void {
  if (event.origin !== window.location.origin) return;
  const msg = event.data;
  const frame = findCanvasFrameBySource(event.source);
  if (!frame || !isRendererMessageFor(msg, {
    projectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    cardId: frame.cardId,
  }) || msg.type !== "frame-ready") return;
  if (!pendingChanges) return;

  scheduleStaleCheck();
}

export function cancelStaleDetection(): void {
  if (verificationTimer) {
    clearTimeout(verificationTimer);
    verificationTimer = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingChanges = null;
  pendingAttempts = new Map();
  window.removeEventListener("message", handleFrameReady);
  notifyPreviewDiagnostics();
}

export function isVerificationPending(): boolean {
  return pendingChanges !== null && verificationTimer !== null;
}
