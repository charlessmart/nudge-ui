import type { ReactElement } from "react";
import type { SketchDocument } from "../../sketch/model.ts";
import { sketchThumbnailCrop } from "../../sketch/ink.ts";
import { BlobImage } from "./BlobImage.tsx";

/** Shows the marks rather than the page behind them, which is the same in every sketch. */
export function SketchThumbnail({ item }: { readonly item: SketchDocument }): ReactElement {
  const crop = item.ink ? sketchThumbnailCrop(item.ink, item.imageWidth, item.imageHeight) : undefined;
  return <BlobImage className="sketch-thumbnail" blob={item.image} crop={crop} />;
}
