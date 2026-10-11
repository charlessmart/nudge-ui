import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { SketchQueueItem } from "./model.ts";

export function SketchThumbnail({ item }: { readonly item: SketchQueueItem }): ReactElement {
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
    <img className="sketch-thumbnail" src={url} alt="" aria-hidden="true" />
  ) : (
    <span className="sketch-thumbnail sketch-thumbnail--empty" aria-hidden="true" />
  );
}
