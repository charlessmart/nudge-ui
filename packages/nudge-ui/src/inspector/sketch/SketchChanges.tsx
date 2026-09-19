import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { IconCheck, IconCopy, IconDownload, IconEdit, IconRefresh, IconTrash } from "@tabler/icons-react";
import { Button } from "../ui/Button.tsx";
import { StatusCallout } from "../ui/StatusCallout.tsx";
import { copyImageToClipboard, downloadImage } from "./raster.ts";
import { editSketch } from "./SketchWorkspace.tsx";
import { removeSketch, requeueSketch, useSketchStore } from "./store.ts";
import { type SketchQueueItem } from "./model.ts";

function routeLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

function statusLabel(status: SketchQueueItem["status"]): string {
  switch (status) {
    case "dispatching": return "Sending";
    case "handing-off": return "Handing off";
    case "needs-review": return "Needs review";
    case "unknown": return "Unknown";
    default: return "Pending";
  }
}

function Thumbnail({ item }: { readonly item: SketchQueueItem }): ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
    const next = URL.createObjectURL(item.document.annotatedImage);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [item.document.annotatedImage]);
  return url ? <img className="sketch-change__thumbnail" src={url} alt="Sketch annotation" data-test="sketch-thumbnail" /> : <div className="sketch-change__thumbnail sketch-change__thumbnail--empty" data-test="sketch-thumbnail" />;
}

function SketchRow({ item }: { readonly item: SketchQueueItem }): ReactElement {
  const [actionError, setActionError] = useState<string | null>(null);
  const busy = item.status === "dispatching" || item.status === "handing-off";
  const canReview = item.status === "needs-review" || item.status === "unknown";
  const document = item.document;

  async function copyImage(): Promise<void> {
    setActionError(null);
    try {
      await copyImageToClipboard(document.annotatedImage);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The image could not be copied.");
    }
  }

  async function runQueueAction(action: () => Promise<boolean>, failureMessage: string): Promise<void> {
    setActionError(null);
    try {
      if (!await action()) setActionError(failureMessage);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : failureMessage);
    }
  }

  return (
    <div className="sketch-change__row" data-test="sketch-row" data-sketch-id={document.id}>
      <Thumbnail item={item} />
      <div className="sketch-change__body">
        <div className="sketch-change__heading">
          <span className="sketch-change__name">{document.filename}</span>
          <span className="sketch-change__status" data-test="sketch-status" data-status={item.status}>{statusLabel(item.status)}</span>
        </div>
        <span className="sketch-change__route">{routeLabel(document.capture.url)} · revision {document.revision}</span>
        {document.description ? <p className="sketch-change__description">{document.description}</p> : null}
        {document.annotations?.length ? (
          <ol className="sketch-change__annotations">
            {document.annotations.map((annotation) => (
              <li key={annotation.id}>
                <span>{annotation.number}.</span> {annotation.description}
              </li>
            ))}
          </ol>
        ) : null}
        <div className="sketch-change__actions">
          <Button size="compact" variant="quiet" type="button" data-test="sketch-copy-image" onClick={() => void copyImage()}>
            <IconCopy size="var(--icon-size-small)" aria-hidden="true" /> Copy image
          </Button>
          <Button size="compact" variant="quiet" type="button" data-test="sketch-download-image" onClick={() => downloadImage(document.annotatedImage, document.filename)}>
            <IconDownload size="var(--icon-size-small)" aria-hidden="true" /> Download
          </Button>
          <Button size="compact" variant="quiet" type="button" data-test="sketch-reopen" onClick={() => editSketch(document.id)} disabled={busy}>
            <IconEdit size="var(--icon-size-small)" aria-hidden="true" /> Reopen
          </Button>
          {canReview ? (
            <Button size="compact" variant="quiet" type="button" data-test="sketch-requeue" onClick={() => void runQueueAction(() => requeueSketch(document.id), "The sketch could not be requeued.")} disabled={busy}>
              <IconRefresh size="var(--icon-size-small)" aria-hidden="true" /> Requeue
            </Button>
          ) : null}
          <Button size="compact" variant="quiet" type="button" data-test="sketch-mark-done" onClick={() => void runQueueAction(() => removeSketch(document.id), "The sketch could not be removed yet.")} disabled={busy}>
            {canReview ? <IconCheck size="var(--icon-size-small)" aria-hidden="true" /> : <IconTrash size="var(--icon-size-small)" aria-hidden="true" />} {canReview ? "Mark done" : "Delete"}
          </Button>
        </div>
        {actionError ? <span className="sketch-change__error" role="status">{actionError}</span> : null}
      </div>
    </div>
  );
}

export function SketchChanges(): ReactElement | null {
  const store = useSketchStore();
  const items = store.items;
  const hasError = store.error !== null;
  if (items.length === 0 && !hasError) return null;
  return (
    <section className="sketch-change" data-test="sketches">
      <div className="sketch-change__title">Sketch annotations <span>{items.length}</span></div>
      {store.error ? <StatusCallout tone="warning" data-test="sketch-storage-error">{store.error}</StatusCallout> : null}
      {items.length > 0 ? items.map((item) => <SketchRow item={item} key={`${item.document.id}:${item.document.revision}`} />) : (
        <StatusCallout tone="warning">Saved sketches need recovery. Reload the page to try again.</StatusCallout>
      )}
    </section>
  );
}
