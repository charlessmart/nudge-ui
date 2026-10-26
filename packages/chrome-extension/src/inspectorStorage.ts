import { createMirroredStorage, type InspectorStorage } from "nudge-ui/internal/page-inspector";
import { createChannelClient, sendNotification } from "./bridge.ts";
import { storageReadChannel } from "./channels.ts";
import { STORAGE_WRITE_EVENT } from "./protocol.ts";

/** Reloads saved state under the workspace lease; writes remain synchronous to callers. */
export function createExtensionInspectorStorage(initial: Record<string, string>): InspectorStorage {
  const client = createChannelClient(storageReadChannel);
  const read = async (): Promise<Record<string, string>> => {
    const reply = await client.send({});
    if (reply.values) return reply.values;
    throw new Error(reply.error ?? "Inspector storage could not be read.");
  };
  return createMirroredStorage(initial, (key, value) => {
    sendNotification(document, STORAGE_WRITE_EVENT, JSON.stringify({ key, value }));
  }, read);
}
