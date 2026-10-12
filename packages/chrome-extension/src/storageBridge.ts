import {
  INJECT_RENDERERS_MESSAGE,
  RENDERER_FRAME_LOAD_EVENT,
  siteKeyPrefix,
  SKETCH_REQUEST_EVENT,
  SKETCH_RESPONSE_EVENT,
  sketchKeyPrefix,
  STORAGE_WRITE_EVENT,
  STORAGE_READ_EVENT,
  STORAGE_READ_RESPONSE_EVENT,
  type SketchRequest,
  type SketchResponse,
  type StorageWrite,
  type StoredSketchRecords,
  type StorageReadResponse,
} from "./protocol.ts";

const BRIDGE_FLAG = "__nudgeUiStorageBridge";

function parseWrite(detail: unknown): StorageWrite | null {
  if (typeof detail !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(detail);
    if (!parsed || typeof parsed !== "object") return null;
    const { key, value } = parsed as Record<string, unknown>;
    if (typeof key !== "string" || (typeof value !== "string" && value !== null)) return null;
    return { key, value };
  } catch {
    return null;
  }
}

function isRecordList(value: unknown): value is { id: string }[] {
  return Array.isArray(value) && value.every((record: unknown) => (
    !!record && typeof record === "object" && typeof (record as { id?: unknown }).id === "string"
  ));
}

function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === "string");
}

function parseSketchRequest(detail: unknown): SketchRequest | null {
  if (typeof detail !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(detail);
    if (!parsed || typeof parsed !== "object") return null;
    const request = parsed as Record<string, unknown>;
    if (typeof request.id !== "number") return null;
    if (request.op === "read") return { id: request.id, op: "read" };
    const put = request.put as Record<string, unknown> | undefined;
    if (
      request.op !== "update" || !put || !isRecordList(put.documents) || !isRecordList(put.handoffs)
      || !isIdList(request.deleteDocumentIds) || !isIdList(request.deleteHandoffIds)
    ) return null;
    return parsed as SketchRequest;
  } catch {
    return null;
  }
}

async function handleSketchRequest(prefix: string, request: SketchRequest): Promise<StoredSketchRecords | undefined> {
  const documentKey = (id: string) => `${prefix}doc:${id}`;
  const handoffKey = (id: string) => `${prefix}handoff:${id}`;
  if (request.op === "read") {
    const keys = (await chrome.storage.local.getKeys()).filter((key) => key.startsWith(prefix));
    const stored = keys.length === 0 ? {} : await chrome.storage.local.get(keys);
    const records: StoredSketchRecords = { documents: [], handoffs: [] };
    for (const [key, value] of Object.entries(stored)) {
      if (key.startsWith(documentKey(""))) records.documents.push(value as StoredSketchRecords["documents"][number]);
      else if (key.startsWith(handoffKey(""))) records.handoffs.push(value as StoredSketchRecords["handoffs"][number]);
    }
    return records;
  }
  const removals = [...request.deleteDocumentIds.map(documentKey), ...request.deleteHandoffIds.map(handoffKey)];
  if (removals.length > 0) await chrome.storage.local.remove(removals);
  const puts = Object.fromEntries([
    ...request.put.documents.map((document) => [documentKey(document.id), document] as const),
    ...request.put.handoffs.map((handoff) => [handoffKey(handoff.id), handoff] as const),
  ]);
  if (Object.keys(puts).length > 0) await chrome.storage.local.set(puts);
  return undefined;
}

// Runs in the isolated world, so the page can dispatch writes but cannot
// choose the origin they are stored under.
const scope = globalThis as typeof globalThis & { [BRIDGE_FLAG]?: true };
if (!scope[BRIDGE_FLAG]) {
  scope[BRIDGE_FLAG] = true;
  const prefix = siteKeyPrefix(location.origin);
  document.addEventListener(STORAGE_READ_EVENT, (event) => {
    const id = (event as CustomEvent<unknown>).detail;
    if (typeof id !== "number" || !Number.isSafeInteger(id)) return;
    const respond = (response: StorageReadResponse): void => {
      document.dispatchEvent(new CustomEvent(STORAGE_READ_RESPONSE_EVENT, { detail: JSON.stringify(response) }));
    };
    void chrome.storage.local.getKeys().then(async (keys) => {
      const siteKeys = keys.filter((key) => key.startsWith(prefix));
      const stored = siteKeys.length ? await chrome.storage.local.get(siteKeys) : {};
      const values: Record<string, string> = {};
      for (const [key, value] of Object.entries(stored)) {
        if (typeof value === "string") values[key.slice(prefix.length)] = value;
      }
      respond({ id, values });
    }).catch((error: unknown) => respond({ id, error: error instanceof Error ? error.message : String(error) }));
  });
  document.addEventListener(STORAGE_WRITE_EVENT, (event) => {
    const write = parseWrite((event as CustomEvent<unknown>).detail);
    if (!write) return;
    const key = prefix + write.key;
    const done = write.value === null
      ? chrome.storage.local.remove(key)
      : chrome.storage.local.set({ [key]: write.value });
    done.catch((error: unknown) => console.warn("[nudge-ui] Could not save inspector state.", error));
  });
  const sketchPrefix = sketchKeyPrefix(location.origin);
  document.addEventListener(SKETCH_REQUEST_EVENT, (event) => {
    const request = parseSketchRequest((event as CustomEvent<unknown>).detail);
    if (!request) return;
    const respond = (response: SketchResponse): void => {
      document.dispatchEvent(new CustomEvent(SKETCH_RESPONSE_EVENT, { detail: JSON.stringify(response) }));
    };
    void handleSketchRequest(sketchPrefix, request).then(
      (records) => respond({ id: request.id, ok: true, ...(records ? { records } : {}) }),
      (error: unknown) => respond({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) }),
    );
  });
  document.addEventListener(RENDERER_FRAME_LOAD_EVENT, () => {
    chrome.runtime.sendMessage({ type: INJECT_RENDERERS_MESSAGE }).catch((error: unknown) => {
      console.warn("[nudge-ui] Could not load the inspector into the preview.", error);
    });
  });
}
