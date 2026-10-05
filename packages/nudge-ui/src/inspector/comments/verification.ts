import { getWorkspaceChanges } from "../changes/workspaceChanges.ts";
import { isCanvasProjectionRevisionCurrent, projectWorkspaceSnapshotToDocument } from "../canvas/projection.ts";
import { commentFingerprint, commentViewport, resolveCommentElement } from "./element.ts";
import { commentRoute, getComments, removeComment } from "./store.ts";

const documentReads = new WeakMap<Document, Promise<unknown>>();
const readingDocuments = new WeakSet<Document>();

export function isReadingCommentSource(doc: Document): boolean { return readingDocuments.has(doc); }

/** Serializes clean reads and restores the latest previews even if the read fails. */
export function readCommentSource<T>(doc: Document, read: () => T): Promise<T | null> {
  const previous = documentReads.get(doc) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    readingDocuments.add(doc);
    try {
      const revision = await projectWorkspaceSnapshotToDocument(doc, { changes: [], structuralChanges: [] });
      if (revision === null || !isCanvasProjectionRevisionCurrent(doc, revision)) return null;
      return read();
    } finally {
      try {
        await projectWorkspaceSnapshotToDocument(doc, getWorkspaceChanges());
        // Deliver projection mutation records before accepting another source signal.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      } finally {
        readingDocuments.delete(doc);
      }
    }
  });
  documentReads.set(doc, operation);
  return operation;
}

/** Changed, uniquely located elements resolve after handoff; missing and ambiguous targets remain. */
export async function reconcileComments(doc: Document): Promise<void> {
  const sent = getComments().filter((item) => item.handedOff && item.route === commentRoute(doc));
  if (sent.length === 0) return;
  const resolved = await readCommentSource(doc, () => sent.filter((item) => {
    if (item.viewport !== commentViewport(doc)) return false;
    const element = resolveCommentElement(doc, item.target);
    return element !== null && commentFingerprint(element) !== item.baseline;
  }));
  for (const item of resolved ?? []) {
    if (getComments().some((current) => current.id === item.id && current.note === item.note && current.handedOff)) removeComment(item.id);
  }
}
