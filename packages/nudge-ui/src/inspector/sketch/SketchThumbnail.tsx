import type { ReactElement } from "react";
import type { SketchQueueItem } from "./model.ts";
import { BlobImage } from "./BlobImage.tsx";

export function SketchThumbnail({ item }: { readonly item: SketchQueueItem }): ReactElement {
  const hasMarks = item.document.strokes.length > 0 || (item.document.annotations?.length ?? 0) > 0;
  return hasMarks ? (
    <BlobImage className="sketch-thumbnail" blob={item.document.annotatedImage} />
  ) : (
    <span className="sketch-thumbnail sketch-thumbnail--empty" aria-hidden="true" />
  );
}
