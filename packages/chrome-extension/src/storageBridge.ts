import { serveChannel } from "./bridge.ts";
import { fontListChannel, storageReadChannel, tabCaptureChannel } from "./channels.ts";
import {
  FONT_LIST_MESSAGE,
  INSPECTOR_ROOT_ID,
  PANEL_SIDE_KEY,
  PANEL_SIDE_WRITE_EVENT,
  parsePanelSide,
  parseFontListResult,
  parseStorageWrite,
  parseTabCaptureResult,
  siteKeyPrefix,
  STORAGE_WRITE_EVENT,
  TAB_CAPTURE_MESSAGE,
  type FontListMessage,
  type TabCaptureMessage,
} from "./protocol.ts";

const BRIDGE_FLAG = "__nudgeUiStorageBridge";
/** nudge-ui's "Show system fonts" row. */
const SYSTEM_FONTS_REQUEST_SELECTOR = '[data-test="system-fonts-request"]';
const GESTURE_EVENTS = ["pointerdown", "mousedown", "mouseup", "click", "keydown"];
/** A screenshot waits for Nudge UI to hide itself first, so a click in Nudge UI stays good for this long. */
const CAPTURE_GESTURE_WINDOW_MS = 10_000;

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

// Runs in the isolated world, so the page can dispatch writes but cannot choose the origin they are stored under.
const scope = globalThis as typeof globalThis & { [BRIDGE_FLAG]?: true };
if (!scope[BRIDGE_FLAG]) {
  scope[BRIDGE_FLAG] = true;
  const prefix = siteKeyPrefix(location.origin);

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
  // A screenshot shows cross-origin frames the page cannot read, so the page alone cannot ask for one: each click or key
  // press in Nudge UI allows one capture.
  let captureGestureAt: number | null = null;
  for (const type of GESTURE_EVENTS) {
    window.addEventListener(type, (event) => {
      if (inspectorGesture(event)) captureGestureAt = performance.now();
    }, true);
  }
  serveChannel(tabCaptureChannel, async () => {
    const gestureAt = captureGestureAt;
    captureGestureAt = null;
    if (gestureAt === null || performance.now() - gestureAt > CAPTURE_GESTURE_WINDOW_MS) {
      return { error: "The tab is captured only after a click or key press in Nudge UI." };
    }
    const message: TabCaptureMessage = { type: TAB_CAPTURE_MESSAGE };
    const reply: unknown = await chrome.runtime.sendMessage(message);
    return parseTabCaptureResult(reply) ?? { error: "The tab could not be captured." };
  }, { target: document });

  serveChannel(fontListChannel, async () => {
    if (!gesture) return { error: "The font list is available only during a click or key press in Nudge UI." };
    const message: FontListMessage = { type: FONT_LIST_MESSAGE, asked: gesture.asksForFonts };
    const reply: unknown = await chrome.runtime.sendMessage(message);
    return parseFontListResult(reply) ?? { error: "The font list could not be read." };
  }, { target: document });
}
