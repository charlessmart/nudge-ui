import { useEffect, useRef, type ReactElement } from "react";

export interface BlobImageProps {
  readonly blob: Blob;
  readonly className: string;
  /** Omitted for decorative images, which are hidden from assistive technology. */
  readonly label?: string;
}

/** Paints an image blob onto a canvas, because a page's `img-src` policy can block `blob:` URLs in `<img>` but not canvas drawing. */
export function BlobImage({ blob, className, label }: BlobImageProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof createImageBitmap !== "function") return;
    let current = true;
    void createImageBitmap(blob).then((bitmap) => {
      if (current) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      }
      bitmap.close();
    }, () => undefined);
    return () => {
      current = false;
    };
  }, [blob]);

  return label
    ? <canvas ref={canvasRef} className={className} role="img" aria-label={label} />
    : <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
