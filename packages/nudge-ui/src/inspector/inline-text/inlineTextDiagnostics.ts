import { useSyncExternalStore } from "react";
import type { InlineTextDiagnostic } from "./inlineTextEditor.ts";

interface StoredDiagnostic {
  readonly diagnostic: InlineTextDiagnostic;
  readonly ownerDocument?: Document;
  readonly target?: Element;
}

const listeners = new Set<() => void>();
let diagnostics: StoredDiagnostic[] = [];
let revision = 0;

function notify(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

function sameDiagnostic(left: InlineTextDiagnostic, right: InlineTextDiagnostic): boolean {
  return left.kind === right.kind
    && left.status === right.status
    && left.reason === right.reason
    && left.before === right.before
    && left.after === right.after;
}

export function recordInlineTextDiagnostic(
  diagnostic: InlineTextDiagnostic,
  ownerDocument?: Document,
  target?: Element,
): void {
  const resolvedDocument = ownerDocument ?? target?.ownerDocument;
  const previous = diagnostics.at(-1);
  if (previous
    && previous.ownerDocument === resolvedDocument
    && previous.target === target
    && sameDiagnostic(previous.diagnostic, diagnostic)) {
    return;
  }
  diagnostics = [
    ...diagnostics.slice(-31),
    { diagnostic, ownerDocument: resolvedDocument, target },
  ];
  notify();
}

export function getInlineTextDiagnostics(): readonly InlineTextDiagnostic[] {
  return diagnostics.map(({ diagnostic }) => diagnostic);
}

export function getInlineTextDiagnostic(): InlineTextDiagnostic | null {
  return diagnostics.at(-1)?.diagnostic ?? null;
}

export function subscribeInlineTextDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInlineTextDiagnostic(): InlineTextDiagnostic | null {
  useSyncExternalStore(
    subscribeInlineTextDiagnostics,
    () => revision,
    () => revision,
  );
  return getInlineTextDiagnostic();
}

/** Clear the current diagnostic, optionally only when it belongs to a frame. */
export function clearInlineTextDiagnostics(ownerDocument?: Document): void {
  const current = diagnostics.at(-1);
  if (!current) return;
  if (ownerDocument && current.ownerDocument !== ownerDocument) return;
  diagnostics = [];
  notify();
}

/** Keep feedback for the target that was just selected, but clear stale feedback. */
export function clearInlineTextDiagnosticsForSelection(
  selectedElements: readonly HTMLElement[],
): void {
  const current = diagnostics.at(-1);
  if (!current) return;
  const target = current.target;
  if (target && selectedElements.length === 1 && selectedElements[0] === target) return;
  clearInlineTextDiagnostics();
}
