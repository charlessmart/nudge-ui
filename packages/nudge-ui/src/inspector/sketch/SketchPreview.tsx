import type { ReactElement } from "react";
import type { SketchQueueItem } from "./model.ts";
import { BlobImage } from "./BlobImage.tsx";

/** A large view of one saved sketch, shown in a popover above its thumbnail so the sketches can be told apart. */
export function SketchPreview({ item }: { readonly item: SketchQueueItem }): ReactElement {
  const { annotatedImage, imageWidth, imageHeight } = item.document;
  return (
    <div className="sketch-preview" data-test="sketch-preview">
      <span className="sketch-preview__title">Click to copy</span>
      <BlobImage className="sketch-preview__image" blob={annotatedImage} width={imageWidth} height={imageHeight} />
    </div>
  );
}
