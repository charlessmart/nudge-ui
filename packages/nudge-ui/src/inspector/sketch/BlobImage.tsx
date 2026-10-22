import { useLayoutEffect, useRef, type ReactElement } from "react";

export interface BlobImageProps {
  readonly blob: Blob;
  readonly className: string;
  /** The picture's size when it is known, so the canvas holds its shape before the picture is drawn. */
  readonly width?: number;
  readonly height?: number;
  /** Omitted for decorative images, which are hidden from assistive technology. */
  readonly label?: string;
}

/** Decoded once per blob, so showing the same picture again (a preview opening, a thumbnail remounting) paints at once. */
const decoded = new WeakMap<Blob, Promise<ImageBitmap>>();

function decode(blob: Blob): Promise<ImageBitmap> {
  let bitmap = decoded.get(blob);
  if (!bitmap) {
    bitmap = createImageBitmap(blob);
    decoded.set(blob, bitmap);
    bitmap.catch(() => decoded.delete(blob));
  }
  return bitmap;
}

/** Paints an image blob onto a canvas, because a page's `img-src` policy can block `blob:` URLs in `<img>` but not canvas drawing. */
export function BlobImage({ blob, className, width, height, label }: BlobImageProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // A layout effect, so a picture that is already decoded is drawn before the first paint rather than a frame after it.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof createImageBitmap !== "function") return;
    let current = true;
    void decode(blob).then((bitmap) => {
      if (!current) return;
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    }, () => undefined);
    return () => {
      current = false;
    };
  }, [blob]);

  return label
    ? <canvas ref={canvasRef} className={className} width={width} height={height} role="img" aria-label={label} />
    : <canvas ref={canvasRef} className={className} width={width} height={height} aria-hidden="true" />;
}
