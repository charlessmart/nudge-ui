/**
 * A tiny lifecycle seam keeps canonical-history clearing independent from the
 * editor implementation. The editor registers its active-session disposer;
 * changesLog can then cancel it without importing the editor back through a
 * circular module edge.
 */
let clearHandler: (() => void) | null = null;

export function registerInlineTextClearHandler(handler: () => void): () => void {
  clearHandler = handler;
  return () => {
    if (clearHandler === handler) clearHandler = null;
  };
}

export function cancelInlineTextForClear(): void {
  clearHandler?.();
}
