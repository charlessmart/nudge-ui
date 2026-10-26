import { serveChannel } from "./bridge.ts";
import { fontListChannel, sketchChannel, storageReadChannel, type SketchRequestBody } from "./channels.ts";
import {
  FONT_LIST_MESSAGE,
  INSPECTOR_ROOT_ID,
  PANEL_SIDE_KEY,
  PANEL_SIDE_WRITE_EVENT,
  parsePanelSide,
  parseFontListResult,
  parseStorageWrite,
  parseStoredSketchDocument,
  siteKeyPrefix,
  sketchKeyPrefix,
  STORAGE_WRITE_EVENT,
  type FontListMessage,
  type StoredSketchRecords,
} from "./protocol.ts";

const BRIDGE_FLAG = "__nudgeUiStorageBridge";
/** nudge-ui's "Show system fonts" row. */
const SYSTEM_FONTS_REQUEST_SELECTOR = '[data-test="system-fonts-request"]';
const GESTURE_EVENTS = ["pointerdown", "mousedown", "mouseup", "click", "keydown"];

interface InspectorGesture {
  asksForFonts: boolean;
}

/** Only the user produces trusted events, so a page script cannot pass for a gesture in Nudge UI. */
function inspectorGesture(event: Event): InspectorGesture | null {
  if (!event.isTrusted) return null;
  const elements = event.composedPath().filter((node) => node instanceof Element);
  if (!elements.some((element) => element.id === INSPECTOR_ROOT_ID)) return null;
  if (!(event instanceof KeyboardEvent)) {
    return { asksForFonts: elements.some((element) => element.matches(SYSTEM_FONTS_REQUEST_SELECTOR)) };
  }
  // Enter chooses the highlighted row while focus stays in the field.
  const root = elements[0]?.getRootNode();
  const row = root instanceof ShadowRoot || root instanceof Document
    ? root.querySelector(`${SYSTEM_FONTS_REQUEST_SELECTOR}[data-highlighted]`)
    : null;
  return { asksForFonts: event.key === "Enter" && row !== null };
}

async function handleSketchRequest(prefix: string, request: SketchRequestBody): Promise<StoredSketchRecords | undefined> {
  const documentKey = (id: string) => `${prefix}doc:${id}`;
  if (request.op === "read") {
    const keys = (await chrome.storage.local.getKeys()).filter((key) => key.startsWith(prefix));
    const stored = keys.length === 0 ? {} : await chrome.storage.local.get(keys);
    const records: StoredSketchRecords = { documents: [] };
    const stale: string[] = [];
    for (const [key, value] of Object.entries(stored)) {
      if (key.startsWith(documentKey(""))) {
        const document = parseStoredSketchDocument(value);
        if (document) records.documents.push(document);
        else stale.push(key);
      } else if (key.startsWith(`${prefix}handoff:`)) {
        // v1 dispatch metadata has no reader; drop it so it does not keep its quota.
        stale.push(key);
      }
    }
    if (stale.length > 0) await chrome.storage.local.remove(stale);
    return records;
  }
  const removals = request.deleteDocumentIds.map(documentKey);
  if (removals.length > 0) await chrome.storage.local.remove(removals);
  const puts = Object.fromEntries(
    request.put.documents.map((document) => [documentKey(document.id), document] as const),
  );
  if (Object.keys(puts).length > 0) await chrome.storage.local.set(puts);
  return undefined;
}

// Runs in the isolated world, so the page can dispatch writes but cannot choose the origin they are stored under.
const scope = globalThis as typeof globalThis & { [BRIDGE_FLAG]?: true };
if (!scope[BRIDGE_FLAG]) {
  scope[BRIDGE_FLAG] = true;
  const prefix = siteKeyPrefix(location.origin);
  const sketchPrefix = sketchKeyPrefix(location.origin);

  serveChannel(storageReadChannel, async () => {
    const keys = await chrome.storage.local.getKeys();
    const siteKeys = keys.filter((key) => key.startsWith(prefix));
    const stored = siteKeys.length ? await chrome.storage.local.get(siteKeys) : {};
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(stored)) {
      if (typeof value === "string") values[key.slice(prefix.length)] = value;
    }
    return { values };
  }, { target: document });

  document.addEventListener(STORAGE_WRITE_EVENT, (event) => {
    const write = parseStorageWrite((event as CustomEvent<unknown>).detail);
    if (!write) return;
    const key = prefix + write.key;
    const done = write.value === null
      ? chrome.storage.local.remove(key)
      : chrome.storage.local.set({ [key]: write.value });
    done.catch((error: unknown) => console.warn("[nudge-ui] Could not save inspector state.", error));
  });
  document.addEventListener(PANEL_SIDE_WRITE_EVENT, (event) => {
    const side = parsePanelSide((event as CustomEvent<unknown>).detail);
    if (!side) return;
    chrome.storage.local.set({ [PANEL_SIDE_KEY]: side })
      .catch((error: unknown) => console.warn("[nudge-ui] Could not save the panel side.", error));
  });

  serveChannel(sketchChannel, async (request) => {
    const records = await handleSketchRequest(sketchPrefix, request);
    return records ? { ok: true, records } : { ok: true };
  }, { target: document });

  // The inspector asks for fonts while handling the user's event, including its effects and microtasks; the gesture lasts until that task ends.
  let gesture: InspectorGesture | null = null;
  for (const type of GESTURE_EVENTS) {
    window.addEventListener(type, (event) => {
      const next = inspectorGesture(event);
      if (!next) return;
      gesture = next;
      setTimeout(() => {
        if (gesture === next) gesture = null;
      });
    }, true);
  }
  serveChannel(fontListChannel, async () => {
    if (!gesture) return { error: "The font list is available only during a click or key press in Nudge UI." };
    const message: FontListMessage = { type: FONT_LIST_MESSAGE, asked: gesture.asksForFonts };
    const reply: unknown = await chrome.runtime.sendMessage(message);
    return parseFontListResult(reply) ?? { error: "The font list could not be read." };
  }, { target: document });
}
