import { getActiveDraftChanges, getDraftChanges } from "../drafts/store.ts";
import type { PreviewResult } from "../projection/managedStylesheet.ts";

/** A logical document is stable while its live document may be replaced. */
export interface PreviewDocument {
  readonly logicalDocument: string;
  readonly sessionId: string;
  readonly draftId?: string;
}

export interface PreviewAttempt extends PreviewDocument {
  readonly draftId: string;
  readonly draftRevision: number;
  readonly attempt: number;
}

export interface PreviewDiagnostic extends PreviewAttempt {
  readonly changeKey: string;
  readonly result: PreviewResult;
}

const HOST_DOCUMENT: PreviewDocument = {
  logicalDocument: "host",
  sessionId: "host-document",
};

let activeSessions = new Map<string, string>([[HOST_DOCUMENT.logicalDocument, HOST_DOCUMENT.sessionId]]);
let attemptsBySession = new Map<string, number>();
let diagnostics = new Map<string, PreviewDiagnostic>();
let diagnosticRevision = 0;
const listeners = new Set<() => void>();

function storageKey(document: PreviewDocument, changeKey: string): string {
  return `${document.draftId ?? getActiveDraftChanges().draftId}\u0000${document.logicalDocument}\u0000${document.sessionId}\u0000${changeKey}`;
}

function sessionKey(document: PreviewDocument): string {
  return `${document.logicalDocument}\u0000${document.sessionId}`;
}

function sameResult(left: PreviewResult, right: PreviewResult): boolean {
  return left.status === right.status
    && left.reason === right.reason
    && left.requestedValue === right.requestedValue
    && left.computedValue === right.computedValue;
}

function notify(): void {
  diagnosticRevision += 1;
  for (const listener of listeners) listener();
}

export function getHostPreviewDocument(): PreviewDocument {
  return { ...HOST_DOCUMENT, draftId: getActiveDraftChanges().draftId };
}

export function startPreviewDocumentSession(document: PreviewDocument): void {
  const previousSession = activeSessions.get(document.logicalDocument);
  if (previousSession === document.sessionId) return;

  activeSessions.set(document.logicalDocument, document.sessionId);
  attemptsBySession.set(sessionKey(document), 0);
  let changed = false;
  for (const [key, diagnostic] of diagnostics) {
    if (diagnostic.logicalDocument === document.logicalDocument) {
      diagnostics.delete(key);
      changed = true;
    }
  }
  if (changed || previousSession !== undefined) notify();
}

/** Late results from an invalidated session are rejected. */
export function invalidatePreviewDocumentSession(
  logicalDocument: string,
  sessionId?: string,
): void {
  const activeSession = activeSessions.get(logicalDocument);
  if (activeSession === undefined || (sessionId !== undefined && activeSession !== sessionId)) return;

  activeSessions.delete(logicalDocument);
  attemptsBySession.delete(sessionKey({ logicalDocument, sessionId: activeSession }));
  let changed = false;
  for (const [key, diagnostic] of diagnostics) {
    if (diagnostic.logicalDocument === logicalDocument && diagnostic.sessionId === activeSession) {
      diagnostics.delete(key);
      changed = true;
    }
  }
  if (changed || activeSession !== undefined) notify();
}

export function beginPreviewAttempt(
  document: PreviewDocument,
  revision = getDraftChanges(document.draftId ?? getActiveDraftChanges().draftId).revision,
): PreviewAttempt | null {
  const draftId = document.draftId ?? getActiveDraftChanges().draftId;
  if (revision !== getDraftChanges(draftId).revision || activeSessions.get(document.logicalDocument) !== document.sessionId) {
    return null;
  }
  const attempt = (attemptsBySession.get(sessionKey(document)) ?? 0) + 1;
  attemptsBySession.set(sessionKey(document), attempt);
  // The attempt stamp already rejects late publishes per key; wiping here would drop other changes' statuses before re-verification.
  return { ...document, draftId, draftRevision: revision, attempt };
}

export function publishPreviewDiagnostic(
  attempt: PreviewAttempt,
  changeKey: string,
  result: PreviewResult,
): boolean {
  if (attempt.draftRevision !== getDraftChanges(attempt.draftId).revision
    || activeSessions.get(attempt.logicalDocument) !== attempt.sessionId
    || attemptsBySession.get(sessionKey(attempt)) !== attempt.attempt) {
    return false;
  }

  const key = storageKey(attempt, changeKey);
  const previous = diagnostics.get(key);
  if (previous
    && previous.changeKey === changeKey
    && previous.draftRevision === attempt.draftRevision
    && previous.attempt === attempt.attempt
    && sameResult(previous.result, result)) {
    return true;
  }
  diagnostics.set(key, { ...attempt, changeKey, result });
  notify();
  return true;
}

export function clearPreviewDiagnostics(changeKeys?: Iterable<string>): void {
  const keys = changeKeys ? new Set(changeKeys) : null;
  let changed = false;
  for (const [key, diagnostic] of diagnostics) {
    if (!keys || keys.has(diagnostic.changeKey)) {
      diagnostics.delete(key);
      changed = true;
    }
  }
  if (changed) notify();
}

export function notifyPreviewDiagnostics(): void {
  notify();
}

export function getPreviewDiagnostic(
  changeKey: string,
  logicalDocument = HOST_DOCUMENT.logicalDocument,
  draftId = getActiveDraftChanges().draftId,
): PreviewDiagnostic | undefined {
  // Pure getter: it runs on the React render path, so side effects here would clear state mid-render.
  const sessionId = activeSessions.get(logicalDocument);
  if (!sessionId) return undefined;
  return diagnostics.get(storageKey({ logicalDocument, sessionId, draftId }, changeKey));
}

/** Also reads non-host documents so Canvas-only conflicts are not write-only. */
export function getAnyPreviewDiagnostic(changeKey: string): PreviewDiagnostic | undefined {
  const host = getPreviewDiagnostic(changeKey, HOST_DOCUMENT.logicalDocument);
  if (host) return host;
  for (const logicalDocument of activeSessions.keys()) {
    if (logicalDocument === HOST_DOCUMENT.logicalDocument) continue;
    const diagnostic = getPreviewDiagnostic(changeKey, logicalDocument);
    if (diagnostic) return diagnostic;
  }
  return undefined;
}

export function subscribePreviewDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPreviewDiagnosticRevision(): number {
  return diagnosticRevision;
}

/** Test and teardown reset; it does not alter canonical workspace state. */
export function resetPreviewDiagnostics(): void {
  activeSessions = new Map([[HOST_DOCUMENT.logicalDocument, HOST_DOCUMENT.sessionId]]);
  attemptsBySession = new Map();
  diagnostics = new Map();
  notify();
}
