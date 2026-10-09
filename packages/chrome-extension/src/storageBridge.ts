import {
  INJECT_RENDERERS_MESSAGE,
  RENDERER_FRAME_LOAD_EVENT,
  siteKeyPrefix,
  STORAGE_WRITE_EVENT,
  type StorageWrite,
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

// Runs in the isolated world, so the page can dispatch writes but cannot
// choose the origin they are stored under.
const scope = globalThis as typeof globalThis & { [BRIDGE_FLAG]?: true };
if (!scope[BRIDGE_FLAG]) {
  scope[BRIDGE_FLAG] = true;
  const prefix = siteKeyPrefix(location.origin);
  document.addEventListener(STORAGE_WRITE_EVENT, (event) => {
    const write = parseWrite((event as CustomEvent<unknown>).detail);
    if (!write) return;
    const key = prefix + write.key;
    const done = write.value === null
      ? chrome.storage.local.remove(key)
      : chrome.storage.local.set({ [key]: write.value });
    done.catch((error: unknown) => console.warn("[nudge-ui] Could not save inspector state.", error));
  });
  document.addEventListener(RENDERER_FRAME_LOAD_EVENT, () => {
    chrome.runtime.sendMessage({ type: INJECT_RENDERERS_MESSAGE }).catch((error: unknown) => {
      console.warn("[nudge-ui] Could not load the inspector into the preview.", error);
    });
  });
}
