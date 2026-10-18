import { getDraftChanges } from "../drafts/store.ts";
import { documentTarget, targetKey } from "../drafts/model.ts";
import { isCanvasProjectionRevisionCurrent, projectDraftToDocument } from "../canvas/projection.ts";
import { commentFingerprint, commentViewport, resolveCommentElement } from "./element.ts";
import { commentRoute, getCommentClearRevision, getComments, removeComment } from "./store.ts";

const documentReads = new WeakMap<Document, Promise<unknown>>();
const readingDocuments = new WeakSet<Document>();

/** Controller transport used while reconciling notes; tests replace the renderer round-trip. */
export interface CommentProjectionTransport {
  readonly projectDraftToDocument: typeof projectDraftToDocument;
  readonly isCanvasProjectionRevisionCurrent: typeof isCanvasProjectionRevisionCurrent;
}

const controllerTransport: CommentProjectionTransport = {
  projectDraftToDocument,
  isCanvasProjectionRevisionCurrent,
};

export function isReadingCommentSource(doc: Document): boolean { return readingDocuments.has(doc); }

/** Serializes clean reads and restores the latest previews even if the read fails. */
export function readCommentSource<T>(
  doc: Document,
  read: () => T,
  transport: CommentProjectionTransport = controllerTransport,
): Promise<T | null> {
  const previous = documentReads.get(doc) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    readingDocuments.add(doc);
    try {
      const revision = await transport.projectDraftToDocument(doc, { changes: [], structuralChanges: [] });
      if (revision === null || !transport.isCanvasProjectionRevisionCurrent(doc, revision)) return null;
      return read();
    } finally {
      try {
        await transport.projectDraftToDocument(doc, getDraftChanges(targetKey(documentTarget(doc.location.href))));
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
export async function reconcileComments(
  doc: Document,
  transport: CommentProjectionTransport = controllerTransport,
): Promise<number> {
  const revision = getCommentClearRevision();
  const sent = getComments().filter((item) => item.handedOff && item.route === commentRoute(doc));
  if (sent.length === 0) return 0;
  const resolved = await readCommentSource(doc, () => sent.filter((item) => {
    if (item.viewport !== commentViewport(doc)) return false;
    const element = resolveCommentElement(doc, item.target);
    return element !== null && commentFingerprint(element) !== item.baseline;
  }), transport);
  if (revision !== getCommentClearRevision()) return 0;
  let removed = 0;
  for (const item of resolved ?? []) {
    if (!getComments().some((current) => current.id === item.id && current.note === item.note && current.handedOff)) continue;
    removeComment(item.id);
    removed += 1;
  }
  return removed;
}
