import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { SketchQueueItem } from "./model.ts";

/** An object URL for the blob, released when the blob changes or the view goes away. */
export function useBlobUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  return url;
}

export function SketchThumbnail({ item }: { readonly item: SketchQueueItem }): ReactElement {
  const hasMarks = item.document.strokes.length > 0 || (item.document.annotations?.length ?? 0) > 0;
  const url = useBlobUrl(hasMarks ? item.document.annotatedImage : null);

  return hasMarks && url ? (
    <img className="sketch-thumbnail" src={url} alt="" aria-hidden="true" />
  ) : (
    <span className="sketch-thumbnail sketch-thumbnail--empty" aria-hidden="true" />
  );
}
