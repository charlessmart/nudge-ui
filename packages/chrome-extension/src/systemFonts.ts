import type { SystemFontSource } from "nudge-ui/internal/page-inspector";
import { createChannelClient } from "./bridge.ts";
import { fontListChannel } from "./channels.ts";

/** Lists fonts through `chrome.fontSettings`, which shows no browser prompt. The service worker releases the list on a site only after the user has chosen the request row there once; `allowed` reports that at injection. */
export function createExtensionSystemFonts(allowed: boolean): SystemFontSource {
  const client = createChannelClient(fontListChannel);
  return {
    access: async () => allowed ? "granted" : "prompt",
    async families() {
      const reply = await client.send({});
      if (!reply.families) throw new Error(reply.error ?? "The font list could not be read.");
      allowed = true;
      return reply.families;
    },
  };
}
