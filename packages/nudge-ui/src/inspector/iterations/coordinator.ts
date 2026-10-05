import type { HtmlArtifactRevision } from "../../transport/artifacts.ts";
import { HTML_ARTIFACT_REVISION_ATTRIBUTE } from "../../transport/artifacts.ts";
import { getDraftForCard, getDraftContentsForCard, clearSavedIterationDraft } from "../drafts/store.ts";
import { lockDraft, type DraftContents } from "../changes/draftChanges.ts";
import { canWriteWorkspace } from "../canvas/workspaceLease.ts";
import { projectDraftToDocument, isCanvasProjectionRevisionCurrent, projectToAllReadyCards } from "../canvas/projection.ts";
import { isInlineTextEditingActive } from "../inline-text/inlineTextEditor.ts";
import { captureHtmlIteration } from "./capture.ts";
import { artifactDocumentUrl, commitHtmlArtifact, readHtmlArtifactRevision } from "./client.ts";

/** Owned transport; tests use a working in-memory artifact store. */
export interface HtmlIterationStorage {
  readRevision(id: string): Promise<HtmlArtifactRevision>;
  commit(id: string, expected: HtmlArtifactRevision, html?: string): Promise<HtmlArtifactRevision>;
}

/** Owns save ordering, draft settlement, and external document promotion. */
export function createHtmlIterationCoordinator(storage: HtmlIterationStorage) {
  const operations = new Map<string, Promise<unknown>>();

  async function serialize<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = operations.get(id) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(operation);
    operations.set(id, pending);
    try { return await pending; }
    finally { if (operations.get(id) === pending) operations.delete(id); }
  }

  return {
    prepare(cardId: string, artifactId: string, baseRevision: string, capture: () => Promise<string>): Promise<DraftContents> {
      return serialize(artifactId, async () => {
        if (!canWriteWorkspace()) throw new Error("This workspace is open in another tab.");
        const draft = getDraftForCard(cardId);
        const workspace = getDraftContentsForCard(cardId);
        if (!draft || draft.target.kind !== "html" || draft.target.artifactId !== artifactId || !workspace) throw new Error("The iteration draft is no longer available.");
        const html = await capture();
        const current = getDraftForCard(cardId);
        if (current?.id !== draft.id || current.revision !== draft.revision) {
          throw new Error("The iteration changed while saving. Your edits are still pending. Try again.");
        }
        const release = lockDraft(draft.id);
        try {
          if (!canWriteWorkspace()) throw new Error("This workspace is open in another tab.");
          await storage.commit(artifactId, { document: baseRevision, preview: baseRevision }, html);
          if (!canWriteWorkspace()) throw new Error("The iteration was saved. Reopen the active workspace to continue.");
        } finally { release(); }
        // No await between releasing the lock and settling this exact revision.
        if (!clearSavedIterationDraft(cardId, draft.revision)) {
          throw new Error("The iteration was saved, but its newer edits remain pending.");
        }
        return workspace;
      });
    },

    refresh(cardId: string, artifactId: string, baseRevision: string, available: () => boolean): Promise<boolean> {
      return serialize(artifactId, async () => {
        const clean = () => {
          const workspace = getDraftContentsForCard(cardId);
          return canWriteWorkspace() && available() && workspace !== null
            && workspace.changes.length === 0 && workspace.structuralChanges.length === 0;
        };
        if (!clean()) return false;
        const revision = await storage.readRevision(artifactId);
        if (!clean()) return false;
        // A previous promotion may have completed while an inline edit deferred reload.
        if (revision.document === revision.preview) return revision.preview !== baseRevision;
        const draft = getDraftForCard(cardId);
        if (!draft) return false;
        const release = lockDraft(draft.id);
        try { await storage.commit(artifactId, revision); }
        finally { release(); }
        return clean();
      });
    },
  };
}

const coordinator = createHtmlIterationCoordinator({ readRevision: readHtmlArtifactRevision, commit: commitHtmlArtifact });

function loadedRevision(frame: HTMLIFrameElement): string {
  const revision = frame.contentDocument?.documentElement.getAttribute(HTML_ARTIFACT_REVISION_ATTRIBUTE);
  if (!revision || !/^[a-f0-9]{64}$/.test(revision)) throw new Error("The HTML iteration is still loading. Try again when the frame is ready.");
  return revision;
}

/** Materializes pending intent before the agent can start editing document.html. */
export async function prepareHtmlIterationHandoff(cardId: string, artifactId: string, frame: HTMLIFrameElement): Promise<DraftContents> {
  if (isInlineTextEditingActive()) throw new Error("Finish editing the text before saving this iteration.");
  const contents = getDraftContentsForCard(cardId);
  if (!contents) throw new Error("The iteration draft is no longer available.");
  if (contents.changes.length + contents.structuralChanges.length === 0) return contents;
  const document = frame.contentDocument;
  const baseRevision = loadedRevision(frame);
  try {
    const workspace = await coordinator.prepare(cardId, artifactId, baseRevision, async () => {
      if (!document || isInlineTextEditingActive()) throw new Error("Finish editing the text before saving this iteration.");
      const workspace = getDraftContentsForCard(cardId);
      if (!workspace) throw new Error("The iteration draft is no longer available.");
      const revision = await projectDraftToDocument(document, workspace);
      if (revision === null) throw new Error("The iteration preview is still updating. Try again.");
      const html = await captureHtmlIteration(frame);
      if (frame.contentDocument !== document || !isCanvasProjectionRevisionCurrent(document, revision)) {
        throw new Error("The iteration changed while saving. Your edits are still pending. Try again.");
      }
      return html;
    });
    frame.src = `${artifactDocumentUrl(artifactId)}?revision=${Date.now()}`;
    return workspace;
  } finally { projectToAllReadyCards(); }
}

export async function refreshHtmlIteration(cardId: string, artifactId: string, frame: HTMLIFrameElement): Promise<boolean> {
  const document = frame.contentDocument;
  return coordinator.refresh(cardId, artifactId, loadedRevision(frame), () =>
    frame.contentDocument === document && !isInlineTextEditingActive(),
  );
}
