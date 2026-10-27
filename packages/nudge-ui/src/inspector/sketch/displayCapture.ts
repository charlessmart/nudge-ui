import type { PixelImage } from "./screenMarkers.ts";

/** A still page sends no new frames, so waiting for one gives up after this and reads the frame already shown. */
const FRAME_WAIT_MS = 150;

type CaptureControllerConstructor = new () => object;

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?(callback: () => void): number;
};

/** A shared screen, window or tab, open for exactly one screenshot. */
export interface DisplayCapture {
  /** Resolves once the stream delivers a frame newer than the call, or after a short wait on a still screen. */
  nextFrame(): Promise<void>;
  /** The frame the stream shows now. */
  read(): PixelImage;
  /** Ends the share, which also takes the browser's sharing indicator away. */
  stop(): void;
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

/**
 * Asks the browser to share the screen. It must be called inside the click that asked for the screenshot, before
 * anything awaits: Safari and Firefox refuse screen sharing outside a user gesture. Chromium is asked for this tab;
 * Safari and Firefox offer a window or a screen, and the corner markers find the page in it.
 */
export function requestDisplayCapture(win: Window = window): Promise<DisplayCapture> {
  const devices = win.navigator?.mediaDevices;
  if (typeof devices?.getDisplayMedia !== "function") {
    return Promise.reject(new Error("This browser cannot share the screen, so it cannot take a screenshot."));
  }
  // SAFETY: CaptureController is Chromium's; checking for it is how the tab-sharing options are kept to Chromium.
  const chromium = typeof (win as Window & { CaptureController?: CaptureControllerConstructor }).CaptureController === "function";
  // SAFETY: Chromium's tab-sharing options are newer than TypeScript's DOM types.
  const options = (chromium
    ? {
      video: { displaySurface: "browser" },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: "include",
      surfaceSwitching: "exclude",
    }
    : { video: true, audio: false }) as DisplayMediaStreamOptions;
  return devices.getDisplayMedia(options).then(
    (stream) => openStream(win, stream),
    (error: unknown) => {
      // The browser says only "Permission denied" when the user cancels the picker or a policy blocks sharing.
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        throw new Error("Screen sharing was cancelled or blocked, so no screenshot was taken.", { cause: error });
      }
      throw error;
    },
  );
}

async function openStream(win: Window, stream: MediaStream): Promise<DisplayCapture> {
  // SAFETY: `requestVideoFrameCallback` is optional on the type and checked before every call.
  const video = win.document.createElement("video") as FrameCallbackVideo;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
  } catch (error) {
    stopStream(stream);
    throw error;
  }
  const canvas = win.document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    stopStream(stream);
    throw new Error("The shared screen could not be read.");
  }
  return {
    nextFrame() {
      return new Promise((resolve) => {
        const timer = setTimeout(resolve, FRAME_WAIT_MS);
        video.requestVideoFrameCallback?.(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
    read() {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    },
    stop() {
      stopStream(stream);
      video.srcObject = null;
    },
  };
}
