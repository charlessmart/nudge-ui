// Keeps canonical-history clearing independent of the editor without importing it back through a circular edge.
import { clearInlineTextDiagnostics } from "./inlineTextDiagnostics.ts";

let clearHandler: (() => void) | null = null;

export function registerInlineTextClearHandler(handler: () => void): () => void {
  clearHandler = handler;
  return () => {
    if (clearHandler === handler) clearHandler = null;
  };
}

export function cancelInlineTextForClear(): void {
  clearHandler?.();
  clearInlineTextDiagnostics();
}
