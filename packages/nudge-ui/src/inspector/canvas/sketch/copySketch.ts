import { showToast } from "../../ui/Toast.tsx";
import type { SketchScreenshot } from "./screenshot.ts";
import { flyScreenshot } from "./screenshotFlight.ts";

/** One and a half times the usual two seconds: the toast is the only sign the clipboard changed. */
const COPIED_TOAST_MS = 3000;
/** How long a refused copy waits for the page to get focus back before it gives up. */
const REFOCUS_WAIT_MS = 2000;

/** The promise form lets the write start inside the user gesture, which Safari and Firefox require. */
async function copyImageToClipboard(image: Blob | Promise<Blob>): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("This browser cannot copy images to the clipboard.");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
}

function untilFocused(): Promise<boolean> {
  if (document.hasFocus()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener("focus", onFocus);
      resolve(false);
    }, REFOCUS_WAIT_MS);
    function onFocus(): void {
      clearTimeout(timer);
      resolve(true);
    }
    window.addEventListener("focus", onFocus, { once: true });
  });
}

/**
 * Chromium refuses a clipboard write while the page is unfocused, and focus can still be on its share picker when the
 * copy started in the click lands. Once the page has focus again, the finished PNG is written once more.
 */
async function copyWithRefocus(first: Promise<void>, image: Promise<Blob>): Promise<void> {
  try {
    await first;
  } catch (error) {
    const png = await image;
    if (!(error instanceof DOMException && error.name === "NotAllowedError") || !await untilFocused()) throw error;
    await copyImageToClipboard(png);
  }
}

/**
 * Copies a screenshot that is still being taken, and says how it went. Call it in the same click as `screenshot` was
 * asked for. Once taken, the picture flies down onto `landing` (the screenshot button) while the copy finishes, and the
 * toast that follows shows it. A failure logs its reason, capture before clipboard, and tells the user why and to try
 * again.
 * Resolves with whether the screenshot reached the clipboard.
 */
export async function copyScreenshot(screenshot: Promise<SketchScreenshot>, landing: () => Element | null): Promise<boolean> {
  const image = screenshot.then((taken) => taken.image);
  const copied = copyWithRefocus(copyImageToClipboard(image), image);
  copied.catch(() => undefined);
  try {
    const { picture, area } = await screenshot;
    const [png] = await Promise.all([image, copied, flyScreenshot(picture, area, landing())]);
    showToast({ title: "Copied to clipboard", timeout: COPIED_TOAST_MS, image: png });
    return true;
  } catch (error) {
    console.warn("[nudge-ui] Screenshot not copied.", error);
    showToast({
      tone: "error",
      title: "Screenshot not copied - try again",
      description: error instanceof Error ? error.message : undefined,
    });
    return false;
  }
}
