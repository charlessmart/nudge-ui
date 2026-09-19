import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { IconCheck, IconCopy, IconX } from "@tabler/icons-react";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { copyImageToClipboard } from "./raster.ts";
import { closeSketchNote } from "./sketchNote.ts";
import { removeSketch, useSketchStore } from "./store.ts";
import type { SketchQueueItem } from "./model.ts";

function SketchThumbnail({ item }: { readonly item: SketchQueueItem }): ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  const hasMarks = item.document.strokes.length > 0 || (item.document.annotations?.length ?? 0) > 0;

  useEffect(() => {
    if (!hasMarks) {
      setUrl(null);
      return;
    }
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
    const next = URL.createObjectURL(item.document.annotatedImage);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [hasMarks, item.document.annotatedImage]);

  return hasMarks && url ? (
    <img className="sketch-layers__thumbnail" src={url} alt="" aria-hidden="true" />
  ) : (
    <span className="sketch-layers__thumbnail sketch-layers__thumbnail--empty" aria-hidden="true" />
  );
}

function SketchLayer({ item, index }: { readonly item: SketchQueueItem; readonly index: number }): ReactElement {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = item.status === "dispatching" || item.status === "handing-off";

  async function copyImage(): Promise<void> {
    setError(null);
    try {
      await copyImageToClipboard(item.document.annotatedImage);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "The sketch image could not be copied.");
    }
  }

  async function deleteLayer(): Promise<void> {
    setError(null);
    try {
      if (!await removeSketch(item.document.id)) {
        setError("This sketch is being sent and cannot be deleted yet.");
      } else {
        closeSketchNote();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "The sketch could not be deleted.");
    }
  }

  return (
    <div className="sketch-layers__item" data-test="sketch-layer" data-sketch-id={item.document.id}>
      <Button
        className="sketch-layers__copy"
        variant="secondary"
        type="button"
        data-test="sketch-layer-copy-image"
        onClick={() => void copyImage()}
        disabled={busy}
      >
        <span className="sketch-layers__copy-label">
          {copied
            ? <IconCheck size="var(--icon-size-small)" aria-hidden="true" />
            : <IconCopy size="var(--icon-size-small)" aria-hidden="true" />}
          <span className="sketch-layers__name">{copied ? "Copied" : `Sketch ${index + 1}`}</span>
        </span>
        <SketchThumbnail item={item} />
      </Button>
      <IconButton
        className="sketch-layers__delete"
        variant="quiet"
        size="compact"
        label="Delete sketch"
        title="Delete sketch"
        data-test="sketch-layer-delete"
        onClick={() => void deleteLayer()}
        disabled={busy}
      >
        <IconX size="var(--icon-size-small)" aria-hidden="true" />
      </IconButton>
      {error ? <span className="sketch-layers__error" role="status">{error}</span> : null}
    </div>
  );
}

export function SketchLayersPanel(): ReactElement | null {
  const { items } = useSketchStore();
  if (items.length === 0) return null;

  return (
    <section className="sketch-layers" data-test="sketch-layers" aria-label="Sketch layers">
      {items.map((item, index) => (
        <SketchLayer key={`${item.document.id}:${item.document.revision}`} item={item} index={index} />
      ))}
      <p className="sketch-layers__hint" data-test="sketch-copy-helper">Copy prompt and sketch individually into agent</p>
    </section>
  );
}
