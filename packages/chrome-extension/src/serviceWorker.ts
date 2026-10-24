import {
  BOOT_GLOBAL,
  CURSOR_IMAGE_BASE_GLOBAL,
  CURSOR_IMAGE_DIRECTORY,
  PANEL_SIDE_KEY,
  parsePanelSide,
  parseFontListMessage,
  PAGE_INSPECTOR_GLOBAL,
  siteKeyPrefix,
  systemFontsKey,
  type ExtensionBoot,
  type FontListResult,
} from "./protocol.ts";

const INSPECTOR_BUNDLE = "nudge-ui.js";
const STORAGE_BRIDGE = "storage-bridge.js";

interface InspectorProbe {
  href: string;
  /** Whether an inspector was already running, in which case the probe toggled it. */
  hadInspector: boolean;
}

// `executeScript` serializes these functions into the page's main world, so they cannot close over module values; names arrive as arguments.
function toggleLoadedInspector(handleName: string): InspectorProbe {
  const handle = (window as unknown as Record<string, { toggle(): void } | undefined>)[handleName];
  handle?.toggle();
  return { href: location.href, hadInspector: handle !== undefined };
}

function publishGlobals(globals: Record<string, unknown>): void {
  Object.assign(window, globals);
}

// `getURL` returns the per-session `use_dynamic_url` ID only for paths that match a web-accessible entry, so resolve a file rather than the directory.
function cursorImageBase(): string {
  const file = "design-select.svg";
  return chrome.runtime.getURL(`${CURSOR_IMAGE_DIRECTORY}${file}`).slice(0, -file.length);
}

/** Reads the origin's inspector state, font consent, and panel side in one storage round trip after listing keys. */
async function readBoot(origin: string): Promise<ExtensionBoot> {
  const prefix = siteKeyPrefix(origin);
  const fontsKey = systemFontsKey(origin);
  const keys = (await chrome.storage.local.getKeys()).filter((key) => key.startsWith(prefix));
  const stored = await chrome.storage.local.get([...keys, fontsKey, PANEL_SIDE_KEY]);
  const storage: Record<string, string> = {};
  for (const key of keys) {
    const value = stored[key];
    if (typeof value === "string") storage[key.slice(prefix.length)] = value;
  }
  return { storage, systemFontsAllowed: stored[fontsKey] === true, panelSide: parsePanelSide(stored[PANEL_SIDE_KEY]) ?? "right" };
}

async function injectInspector(target: chrome.scripting.InjectionTarget, boot: ExtensionBoot): Promise<void> {
  const globals = { [BOOT_GLOBAL]: boot, [CURSOR_IMAGE_BASE_GLOBAL]: cursorImageBase() };
  // The bridge must listen before the bundle writes; the two worlds load independently.
  await Promise.all([
    chrome.scripting.executeScript({ target, files: [STORAGE_BRIDGE] }),
    chrome.scripting.executeScript({ target, world: "MAIN", func: publishGlobals, args: [globals] }),
  ]);
  await chrome.scripting.executeScript({ target, world: "MAIN", files: [INSPECTOR_BUNDLE] });
}

function noop(): void {}

async function currentDocumentId(tabId: number): Promise<string | undefined> {
  const [current] = await chrome.scripting.executeScript({ target: { tabId }, func: noop, injectImmediately: true }).catch(() => []);
  return current?.documentId;
}

function originOf(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href).origin;
  } catch {
    return undefined;
  }
}

/** Runs the inspector inside the page itself, so opening it never reloads the tab or loses page state. */
async function toggleInspector(tab: chrome.tabs.Tab & { id: number }): Promise<void> {
  // `activeTab` exposes the URL with the click, so storage is read while the page is probed.
  const tabOrigin = originOf(tab.url);
  const prefetched = tabOrigin ? readBoot(tabOrigin) : undefined;
  prefetched?.catch(() => undefined);
  const [probe] = await chrome.scripting.executeScript({
    target: { tabId: tab.id }, world: "MAIN", func: toggleLoadedInspector, args: [PAGE_INSPECTOR_GLOBAL],
  });
  if (!probe?.result) throw new Error("the page cannot be scripted");
  if (probe.result.hadInspector) return;
  const origin = originOf(probe.result.href);
  if (!origin) throw new Error("the page URL is unavailable");
  const boot = await (origin === tabOrigin && prefetched ? prefetched : readBoot(origin));
  try {
    await injectInspector({ tabId: tab.id, documentIds: [probe.documentId] }, boot);
  } catch (error) {
    // The tab navigated after the probe; the new page has no inspector to report on.
    if (await currentDocumentId(tab.id) !== probe.documentId) return;
    throw error;
  }
}

async function reportUnavailable(tabId: number, error: unknown): Promise<void> {
  const reason = error instanceof Error ? error.message : String(error);
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#d93025" });
  await chrome.action.setBadgeText({ tabId, text: "!" });
  await chrome.action.setTitle({ tabId, title: `Nudge UI cannot run on this page: ${reason}` });
}

async function clearUnavailable(tabId: number): Promise<void> {
  await chrome.action.setBadgeText({ tabId, text: "" });
  await chrome.action.setTitle({ tabId, title: chrome.runtime.getManifest().action?.default_title ?? "Nudge UI" });
}

const tabTasks = new Map<number, Promise<void>>();

/** Serializes clicks on one tab, so a quick second click toggles the instance the first one injected. */
function queueTabTask(tabId: number, task: () => Promise<void>): Promise<void> {
  const pending = (tabTasks.get(tabId) ?? Promise.resolve()).catch(() => undefined).then(task);
  tabTasks.set(tabId, pending);
  const remove = (): void => {
    if (tabTasks.get(tabId) === pending) tabTasks.delete(tabId);
  };
  void pending.then(remove, remove);
  return pending;
}

chrome.action.onClicked.addListener((tab) => {
  const tabId = tab.id;
  if (tabId === undefined) return;
  void queueTabTask(tabId, async () => {
    try {
      await toggleInspector({ ...tab, id: tabId });
      // Clear any failure left by an earlier attempt on this tab.
      await clearUnavailable(tabId);
    } catch (error) {
      await reportUnavailable(tabId, error);
    }
  });
});

// A failure describes the page it happened on, so it is cleared when the tab navigates.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "loading") return;
  void chrome.action.getBadgeText({ tabId }).then((text) => {
    if (text) return clearUnavailable(tabId);
  }).catch(() => undefined);
});

/** Releases the list on an origin only once the user has asked for it there; `fontId` is the family name CSS matches. */
async function readFontList(origin: string | undefined, asked: boolean): Promise<FontListResult> {
  if (!origin) return { error: "The requesting page has no origin." };
  const key = systemFontsKey(origin);
  if (asked) await chrome.storage.local.set({ [key]: true });
  else if ((await chrome.storage.local.get(key))[key] !== true) return { error: "System fonts have not been requested on this site." };
  try {
    return { families: (await chrome.fontSettings.getFontList()).map((font) => font.fontId) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.tab?.id === undefined || sender.frameId !== 0) return;
  const fontList = parseFontListMessage(message);
  if (!fontList) return;
  void readFontList(sender.origin, fontList.asked).then(sendResponse);
  // Keeps the channel open for the asynchronous reply.
  return true;
});
