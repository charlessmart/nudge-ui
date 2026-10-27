import type { TabCaptureSource } from "nudge-ui/internal/page-inspector";
import { createChannelClient } from "./bridge.ts";
import { tabCaptureChannel } from "./channels.ts";

/** The service worker can take a little longer than other bridge requests while the browser composites the tab. */
const CAPTURE_TIMEOUT_MS = 10_000;

/** Decoded by hand: this runs in the page's world, where a strict `connect-src` blocks fetching a data URL. */
function pngFromDataUrl(dataUrl: string): Blob {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: "image/png" });
}

/** Takes sketch screenshots with `chrome.tabs.captureVisibleTab`, through the isolated-world bridge. */
export function createExtensionTabCapture(): TabCaptureSource {
  const client = createChannelClient(tabCaptureChannel, { timeoutMs: CAPTURE_TIMEOUT_MS });
  return {
    async capture() {
      const response = await client.send({});
      if (!response.dataUrl) throw new Error(response.error ?? "The tab could not be captured.");
      return createImageBitmap(pngFromDataUrl(response.dataUrl));
    },
  };
}
