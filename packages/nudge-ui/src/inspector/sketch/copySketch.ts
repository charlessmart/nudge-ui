import { showToast } from "../ui/Toast.tsx";
import { copyImageToClipboard } from "./raster.ts";

function reportCopyFailure(title: string, error: unknown): void {
  showToast({
    tone: "error",
    title,
    description: error instanceof Error ? error.message : "The sketch image could not be copied.",
  });
}

/** The toast is the only sign the clipboard changed, so success is announced too. */
function reportAutoCopy(copied: Promise<void>): void {
  void copied.then(
    () => showToast({ title: "Copied to clipboard" }),
    (error: unknown) => reportCopyFailure("Sketch saved, but not copied", error),
  );
}

export function copySketchImage(image: Blob): Promise<void> {
  const copied = copyImageToClipboard(image);
  reportAutoCopy(copied);
  return copied.catch(() => undefined);
}

export function copySketchImageOnRequest(image: Blob): Promise<void> {
  const copied = copyImageToClipboard(image);
  void copied.catch((error: unknown) => reportCopyFailure("Sketch not copied", error));
  return copied.catch(() => undefined);
}

/** A failed save skips the toast and rethrows so the caller can show its own error; the clipboard write starts before `save` resolves. */
export async function saveAndCopySketch(save: () => Promise<Blob>): Promise<void> {
  let resolveImage: (blob: Blob) => void = () => undefined;
  let rejectImage: (reason: unknown) => void = () => undefined;
  const image = new Promise<Blob>((resolve, reject) => {
    resolveImage = resolve;
    rejectImage = reject;
  });
  image.catch(() => undefined);
  const copied = copyImageToClipboard(image);
  copied.catch(() => undefined);
  try {
    resolveImage(await save());
  } catch (error) {
    rejectImage(error);
    throw error;
  }
  reportAutoCopy(copied);
}
