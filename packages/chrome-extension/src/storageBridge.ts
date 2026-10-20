import {
  FONT_LIST_MESSAGE,
  FONT_LIST_REQUEST_EVENT,
  FONT_LIST_RESPONSE_EVENT,
  INJECT_RENDERERS_MESSAGE,
  parseFontListResult,
  parseSketchRequest,
  parseStorageWrite,
  parseStoredSketchDocument,
  parseStoredSketchHandoff,
  RENDERER_FRAME_LOAD_EVENT,
  siteKeyPrefix,
  SKETCH_REQUEST_EVENT,
  SKETCH_RESPONSE_EVENT,
  sketchKeyPrefix,
  STORAGE_WRITE_EVENT,
  STORAGE_READ_EVENT,
  STORAGE_READ_RESPONSE_EVENT,
  type FontListMessage,
  type FontListResponse,
  type SketchRequest,
  type SketchResponse,
  type StoredSketchRecords,
  type StorageReadResponse,
} from "./protocol.ts";

const BRIDGE_FLAG = "__nudgeUiStorageBridge";
/** nudge-ui's mount; its shadow root also holds the inspector's popups. */
const INSPECTOR_ROOT_ID = "nudge-ui-root";
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

async function handleSketchRequest(prefix: string, request: SketchRequest): Promise<StoredSketchRecords | undefined> {
  const documentKey = (id: string) => `${prefix}doc:${id}`;
  const handoffKey = (id: string) => `${prefix}handoff:${id}`;
  if (request.op === "read") {
    const keys = (await chrome.storage.local.getKeys()).filter((key) => key.startsWith(prefix));
    const stored = keys.length === 0 ? {} : await chrome.storage.local.get(keys);
    const records: StoredSketchRecords = { documents: [], handoffs: [] };
    for (const [key, value] of Object.entries(stored)) {
      if (key.startsWith(documentKey(""))) {
        const document = parseStoredSketchDocument(value);
        if (document) records.documents.push(document);
      } else if (key.startsWith(handoffKey(""))) {
        const handoff = parseStoredSketchHandoff(value);
        if (handoff) records.handoffs.push(handoff);
      }
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

// Runs in the isolated world, so the page can dispatch writes but cannot choose the origin they are stored under.
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
    const write = parseStorageWrite((event as CustomEvent<unknown>).detail);
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
  // The inspector asks for fonts while handling the user's event, including its
  // effects and microtasks; the gesture lasts until that task ends.
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
  document.addEventListener(FONT_LIST_REQUEST_EVENT, (event) => {
    // SAFETY: the detail stays unknown until the ID check below.
    const id = (event as CustomEvent<unknown>).detail;
    if (typeof id !== "number" || !Number.isSafeInteger(id)) return;
    const respond = (response: FontListResponse): void => {
      document.dispatchEvent(new CustomEvent(FONT_LIST_RESPONSE_EVENT, { detail: JSON.stringify(response) }));
    };
    if (!gesture) {
      respond({ id, error: "The font list is available only during a click or key press in Nudge UI." });
      return;
    }
    const message: FontListMessage = { type: FONT_LIST_MESSAGE, asked: gesture.asksForFonts };
    void chrome.runtime.sendMessage(message).then((reply: unknown) => {
      const result = parseFontListResult(reply);
      respond(result ? { id, ...result } : { id, error: "The font list could not be read." });
    }, (error: unknown) => respond({ id, error: error instanceof Error ? error.message : String(error) }));
  });
  document.addEventListener(RENDERER_FRAME_LOAD_EVENT, () => {
    chrome.runtime.sendMessage({ type: INJECT_RENDERERS_MESSAGE }).catch((error: unknown) => {
      console.warn("[nudge-ui] Could not load the inspector into the preview.", error);
    });
  });
}
