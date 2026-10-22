import type { ReactElement } from "react";
import type { SketchQueueItem } from "./model.ts";
import { useBlobUrl } from "./SketchThumbnail.tsx";

/** A large view of one saved sketch, shown in a popover above its thumbnail so the sketches can be told apart. */
export function SketchPreview({ item }: { readonly item: SketchQueueItem }): ReactElement {
  const url = useBlobUrl(item.document.annotatedImage);
  return (
    <div className="sketch-preview" data-test="sketch-preview">
      <span className="sketch-preview__title">Click to copy</span>
      {url ? <img className="sketch-preview__image" src={url} alt="" aria-hidden="true" /> : null}
    </div>
  );
}
