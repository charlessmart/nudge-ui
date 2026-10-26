import { showToast } from "../../ui/Toast.tsx";
import { copyImageToClipboard } from "../../sketch/raster.ts";

/** One and a half times the usual two seconds: the toast is the only sign the clipboard changed. */
const COPIED_TOAST_MS = 3000;

function reportCopyFailure(title: string, error: unknown): void {
  showToast({
    tone: "error",
    title,
    description: error instanceof Error ? error.message : "The sketch image could not be copied.",
  });
}

/** The toast is the only sign the clipboard changed, so success is announced too. */
function reportCopySuccess(): void {
  showToast({ title: "Copied to clipboard", timeout: COPIED_TOAST_MS });
}

/** Copies a kept sketch again. The user asked for it, so success is confirmed as well as failure. */
export function copySketchImageOnRequest(image: Blob): Promise<void> {
  const copied = copyImageToClipboard(image);
  void copied.then(
    reportCopySuccess,
    (error: unknown) => reportCopyFailure("Sketch not copied", error),
  );
  return copied.catch(() => undefined);
}

/** Resolves once the sketch has been saved and copied; rejects if either fails so the caller can keep the sketch. The clipboard write starts before `save` resolves, as Safari requires. */
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
  try {
    await copied;
  } catch (error) {
    const reason = error instanceof Error && error.message ? ` ${error.message}` : "";
    throw new Error(`The sketch was saved, but it could not be copied.${reason}`);
  }
  reportCopySuccess();
}
