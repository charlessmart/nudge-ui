import type { SystemFontSource } from "nudge-ui/internal/page-inspector";
import { FONT_LIST_REQUEST_EVENT, FONT_LIST_RESPONSE_EVENT, parseFontListResponse } from "./protocol.ts";

function readFontList(id: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const finish = (): void => {
      clearTimeout(timeout);
      document.removeEventListener(FONT_LIST_RESPONSE_EVENT, onResponse);
    };
    const onResponse = (event: Event): void => {
      // SAFETY: the detail stays unknown until the parser checks it.
      const response = parseFontListResponse((event as CustomEvent<unknown>).detail);
      if (!response || response.id !== id) return;
      finish();
      if (response.families) resolve(response.families);
      else reject(new Error(response.error ?? "The font list could not be read."));
    };
    const timeout = setTimeout(() => {
      finish();
      reject(new Error("The font list did not respond."));
    }, 5000);
    document.addEventListener(FONT_LIST_RESPONSE_EVENT, onResponse);
    document.dispatchEvent(new CustomEvent(FONT_LIST_REQUEST_EVENT, { detail: id }));
  });
}

/** Lists fonts through `chrome.fontSettings`, which shows no browser prompt. The service worker releases the list on a site only after the user has chosen the request row there once; `allowed` reports that at injection. */
export function createExtensionSystemFonts(allowed: boolean): SystemFontSource {
  let nextId = 0;
  return {
    access: async () => allowed ? "granted" : "prompt",
    async families() {
      const families = await readFontList(++nextId);
      allowed = true;
      return families;
    },
  };
}
