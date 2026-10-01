import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { IconCheck, IconCopy, IconX } from "@tabler/icons-react";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { copyImageToClipboard } from "./raster.ts";
import { closeSketchNote } from "./sketchNote.ts";
import { removeSketch, useSketchStore } from "./store.ts";
import type { SketchQueueItem } from "./model.ts";
import { useFocusedCardId, useSelectedCardId } from "../canvas/canvasStore.ts";
import { sketchBelongsToCard, useVersionHistory } from "../history/store.ts";
import { Tooltip } from "../ui/Tooltip.tsx";

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

function SketchLayer({
  item,
  index,
  multiple,
}: {
  readonly item: SketchQueueItem;
  readonly index: number;
  readonly multiple: boolean;
}): ReactElement {
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
        variant="primary"
        type="button"
        data-test="sketch-layer-copy-image"
        onClick={() => void copyImage()}
        disabled={busy}
      >
        <span className="sketch-layers__copy-label">
          {copied
            ? <IconCheck size="var(--icon-size-small)" aria-hidden="true" />
            : <IconCopy size="var(--icon-size-small)" aria-hidden="true" />}
          <span className="sketch-layers__name">
            {copied ? "Copied" : `Copy sketch note${multiple ? ` ${index + 1}` : ""}`}
          </span>
        </span>
        <SketchThumbnail item={item} />
      </Button>
      <Tooltip>
        <IconButton
          className="sketch-layers__delete"
          variant="quiet"
          size="compact"
          label="Delete sketch"
          data-test="sketch-layer-delete"
          onClick={() => void deleteLayer()}
          disabled={busy}
        >
          <IconX size="var(--icon-size-small)" aria-hidden="true" />
        </IconButton>
      </Tooltip>
      {error ? <span className="sketch-layers__error" role="status">{error}</span> : null}
    </div>
  );
}

export function SketchLayersPanel(): ReactElement | null {
  const { items } = useSketchStore();
  useVersionHistory();
  const selectedCardId = useSelectedCardId();
  const focusedCardId = useFocusedCardId();
  const cardId = selectedCardId ?? focusedCardId;
  const visibleItems = items.filter((item) => sketchBelongsToCard(item.document.id, cardId));
  if (visibleItems.length === 0) return null;

  return (
    <section className="sketch-layers" data-test="sketch-layers" aria-label="Sketch layers">
      {visibleItems.map((item, index) => (
        <SketchLayer
          key={`${item.document.id}:${item.document.revision}`}
          item={item}
          index={index}
          multiple={visibleItems.length > 1}
        />
      ))}
      <p className="sketch-layers__hint" data-test="sketch-copy-helper">Copy the prompt and each sketch note image into the agent</p>
    </section>
  );
}
