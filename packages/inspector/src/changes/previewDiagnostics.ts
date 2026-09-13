import { getWorkspaceChanges, subscribeWorkspaceChanges } from "./workspaceChanges.ts";
import type { PreviewResult } from "../projection/managedStylesheet.ts";

/** A logical document is stable while its live document may be replaced. */
export interface PreviewDocument {
  readonly logicalDocument: string;
  readonly sessionId: string;
}

export interface PreviewAttempt extends PreviewDocument {
  readonly workspaceRevision: number;
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

let workspaceRevision = getWorkspaceChanges().revision;
let activeSessions = new Map<string, string>([[HOST_DOCUMENT.logicalDocument, HOST_DOCUMENT.sessionId]]);
let attemptsBySession = new Map<string, number>();
let diagnostics = new Map<string, PreviewDiagnostic>();
let diagnosticRevision = 0;
const listeners = new Set<() => void>();

function storageKey(document: PreviewDocument, changeKey: string): string {
  return `${document.logicalDocument}\u0000${document.sessionId}\u0000${changeKey}`;
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

function syncWorkspaceRevision(): void {
  const nextRevision = getWorkspaceChanges().revision;
  if (nextRevision === workspaceRevision) return;
  workspaceRevision = nextRevision;
  diagnostics.clear();
  notify();
}

subscribeWorkspaceChanges(syncWorkspaceRevision);

/** Returns the stable host-document identity for this inspector lifetime. */
export function getHostPreviewDocument(): PreviewDocument {
  return HOST_DOCUMENT;
}

/** Starts or replaces the live session for one logical document. */
export function startPreviewDocumentSession(document: PreviewDocument): void {
  syncWorkspaceRevision();
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

/** Invalidates a live document session and rejects all of its late results. */
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

/** Opens a verification attempt for the currently active document session. */
export function beginPreviewAttempt(
  document: PreviewDocument,
  revision = getWorkspaceChanges().revision,
): PreviewAttempt | null {
  syncWorkspaceRevision();
  if (revision !== workspaceRevision || activeSessions.get(document.logicalDocument) !== document.sessionId) {
    return null;
  }
  const attempt = (attemptsBySession.get(sessionKey(document)) ?? 0) + 1;
  attemptsBySession.set(sessionKey(document), attempt);
  return { ...document, workspaceRevision: revision, attempt };
}

/** Publishes only a result from the active revision, session, and attempt. */
export function publishPreviewDiagnostic(
  attempt: PreviewAttempt,
  changeKey: string,
  result: PreviewResult,
): boolean {
  syncWorkspaceRevision();
  if (attempt.workspaceRevision !== workspaceRevision
    || activeSessions.get(attempt.logicalDocument) !== attempt.sessionId
    || attemptsBySession.get(sessionKey(attempt)) !== attempt.attempt) {
    return false;
  }

  const key = storageKey(attempt, changeKey);
  const previous = diagnostics.get(key);
  if (previous
    && previous.changeKey === changeKey
    && previous.workspaceRevision === attempt.workspaceRevision
    && previous.attempt === attempt.attempt
    && sameResult(previous.result, result)) {
    return true;
  }
  diagnostics.set(key, { ...attempt, changeKey, result });
  notify();
  return true;
}

/** Removes diagnostics for the supplied canonical keys across live documents. */
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

/** Notifies consumers when verification state changes without a result. */
export function notifyPreviewDiagnostics(): void {
  notify();
}

export function getPreviewDiagnostic(
  changeKey: string,
  logicalDocument = HOST_DOCUMENT.logicalDocument,
): PreviewDiagnostic | undefined {
  syncWorkspaceRevision();
  const sessionId = activeSessions.get(logicalDocument);
  if (!sessionId) return undefined;
  const diagnostic = diagnostics.get(storageKey({ logicalDocument, sessionId }, changeKey));
  return diagnostic?.workspaceRevision === workspaceRevision ? diagnostic : undefined;
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
  workspaceRevision = getWorkspaceChanges().revision;
  activeSessions = new Map([[HOST_DOCUMENT.logicalDocument, HOST_DOCUMENT.sessionId]]);
  attemptsBySession = new Map();
  diagnostics = new Map();
  notify();
}
