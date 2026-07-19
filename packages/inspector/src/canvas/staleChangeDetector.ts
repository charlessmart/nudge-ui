import type { ChangeRecord, TokenChangeRecord } from "../changesLog.ts";
import { isTokenChange } from "../changesLog.ts";
import type { PreviewResult } from "../managedStylesheet.ts";
import { getRegisteredFrames } from "./projection.ts";
import { getCanvasCards } from "./canvasStore.ts";
import { tokenCatalog } from "virtual:design-tokens";
import type { TokenDefinition } from "virtual:design-tokens";

const VERIFICATION_TIMEOUT_MS = 5000;
const STALE_CHECK_DEBOUNCE_MS = 100;

let verificationTimer: ReturnType<typeof setTimeout> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingChanges: ChangeRecord[] | null = null;

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

function getRequestedValue(change: ChangeRecord): string {
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

function gatherMatchEvidence(changes: ChangeRecord[]): Map<number, string[]> {
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

function applyStaleResults(changes: ChangeRecord[]): void {
  const evidence = gatherMatchEvidence(changes);

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]!;
    if (change.previewResult !== undefined) continue;

    if (isTokenChange(change)) {
      const drift = checkTokenDrift(change);
      if (drift) {
        change.previewResult = drift;
      }
      continue;
    }

    const routes = evidence.get(i);
    if (!routes || routes.length === 0) {
      change.previewResult = buildStaleResult(
        change.selector,
        getRequestedValue(change),
      );
    }
  }
}

function scheduleStaleCheck(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (pendingChanges) {
      applyStaleResults(pendingChanges);
    }
  }, STALE_CHECK_DEBOUNCE_MS);
}

export function startStaleDetection(changes: ChangeRecord[]): void {
  if (changes.length === 0) return;

  for (const change of changes) {
    change.previewResult = undefined;
  }

  pendingChanges = changes;

  if (verificationTimer) clearTimeout(verificationTimer);
  verificationTimer = setTimeout(() => {
    if (pendingChanges) {
      applyStaleResults(pendingChanges);
      pendingChanges = null;
    }
    verificationTimer = null;
  }, VERIFICATION_TIMEOUT_MS);

  window.addEventListener("message", handleFrameReady);
}

function handleFrameReady(event: MessageEvent): void {
  if (event.origin !== window.location.origin) return;
  const msg = event.data;
  if (!msg || typeof msg !== "object" || msg.type !== "frame-ready") return;
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
  window.removeEventListener("message", handleFrameReady);
}

export function isVerificationPending(): boolean {
  return pendingChanges !== null && verificationTimer !== null;
}
