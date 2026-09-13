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
} from "../changes/previewDiagnostics.ts";
import { getWorkspaceChanges } from "../changes/workspaceChanges.ts";
import type { PreviewResult } from "../projection/managedStylesheet.ts";
import { getRegisteredFrames } from "./projection.ts";
import { findCanvasFrameBySource, PROJECT_ID, WORKSPACE_ID } from "./projection.ts";
import { getCanvasCards } from "./canvasStore.ts";
import { isRendererMessageFor } from "./frameProtocol.ts";
import type { TokenDefinition } from "@nudge-ui/css/model";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";

const VERIFICATION_TIMEOUT_MS = 5000;
const STALE_CHECK_DEBOUNCE_MS = 100;

let verificationTimer: ReturnType<typeof setTimeout> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingChanges: PreviewableChangeRecord[] | null = null;
let pendingAttempt: PreviewAttempt | null = null;

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

function gatherMatchEvidence(
  changes: PreviewableChangeRecord[],
): Map<number, string[]> {
  const evidence = new Map<number, string[]>();

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]!;
    if (isTokenChange(change)) continue;

    if (checkSelectorInDocument(document, change.selector)) {
      const routes = evidence.get(i) ?? [];
      routes.push(window.location.href);
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
        routes.push(card.url);
        evidence.set(i, routes);
      }
    }
  }

  return evidence;
}

function applyStaleResults(changes: PreviewableChangeRecord[], attempt: PreviewAttempt | null): void {
  if (!attempt) return;
  const evidence = gatherMatchEvidence(changes);

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]!;

    if (isTokenChange(change)) {
      const drift = checkTokenDrift(change);
      if (drift) {
        publishPreviewDiagnostic(attempt, changeKey(change), drift);
      }
      continue;
    }
    const routes = evidence.get(i);
    if (!routes || routes.length === 0) {
      publishPreviewDiagnostic(attempt, changeKey(change), buildStaleResult(
        change.selector,
        getRequestedValue(change),
      ));
    }
  }
}

function scheduleStaleCheck(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (pendingChanges) {
      const nextAttempt = beginPreviewAttempt(getHostPreviewDocument(), getWorkspaceChanges().revision);
      if (nextAttempt) {
        pendingAttempt = nextAttempt;
        clearPreviewDiagnostics(pendingChanges.map(changeKey));
      }
      applyStaleResults(pendingChanges, pendingAttempt);
    }
  }, STALE_CHECK_DEBOUNCE_MS);
}

export function startStaleDetection(changes: ChangeRecord[]): void {
  const previewableChanges = changes.filter(isPreviewableChange);
  if (previewableChanges.length === 0) return;

  clearPreviewDiagnostics(previewableChanges.map(changeKey));
  pendingAttempt = beginPreviewAttempt(getHostPreviewDocument(), getWorkspaceChanges().revision);

  pendingChanges = previewableChanges;

  if (verificationTimer) clearTimeout(verificationTimer);
  verificationTimer = setTimeout(() => {
    if (pendingChanges) {
      applyStaleResults(pendingChanges, pendingAttempt);
      pendingChanges = null;
    }
    pendingAttempt = null;
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
  pendingAttempt = null;
  window.removeEventListener("message", handleFrameReady);
  notifyPreviewDiagnostics();
}

export function isVerificationPending(): boolean {
  return pendingChanges !== null && verificationTimer !== null;
}
