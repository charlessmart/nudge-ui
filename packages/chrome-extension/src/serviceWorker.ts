import {
  BOOT_GLOBAL,
  CURSOR_IMAGE_BASE_GLOBAL,
  CURSOR_IMAGE_DIRECTORY,
  PAGE_INSPECTOR_GLOBAL,
  siteKeyPrefix,
  type ExtensionBoot,
} from "./protocol.ts";

const INSPECTOR_BUNDLE = "nudge-ui.js";
const STORAGE_BRIDGE = "storage-bridge.js";

// `executeScript` serializes these functions into the page's main world, so
// they cannot close over module values; names arrive as arguments.
function toggleLoadedInspector(handleName: string): boolean {
  const handle = (window as unknown as Record<string, { toggle(): void } | undefined>)[handleName];
  if (!handle) return false;
  handle.toggle();
  return true;
}

function publishBoot(globals: Record<string, unknown>): void {
  Object.assign(window, globals);
}

// `getURL` returns the per-session `use_dynamic_url` ID only for paths that
// match a web-accessible entry, so resolve a file rather than the directory.
function cursorImageBase(): string {
  const file = "design-select.svg";
  return chrome.runtime.getURL(`${CURSOR_IMAGE_DIRECTORY}${file}`).slice(0, -file.length);
}

async function readSiteStorage(origin: string): Promise<Record<string, string>> {
  const prefix = siteKeyPrefix(origin);
  const keys = (await chrome.storage.local.getKeys()).filter((key) => key.startsWith(prefix));
  if (keys.length === 0) return {};
  const stored = await chrome.storage.local.get(keys);
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (typeof value === "string") values[key.slice(prefix.length)] = value;
  }
  return values;
}

async function toggleInspector(tab: chrome.tabs.Tab & { id: number }): Promise<void> {
  const target = { tabId: tab.id };
  const [toggled] = await chrome.scripting.executeScript({
    target, world: "MAIN", func: toggleLoadedInspector, args: [PAGE_INSPECTOR_GLOBAL],
  });
  if (toggled?.result !== true) {
    if (!tab.url) throw new Error("the tab URL is unavailable");
    const boot: ExtensionBoot = { storage: await readSiteStorage(new URL(tab.url).origin) };
    await chrome.scripting.executeScript({ target, files: [STORAGE_BRIDGE] });
    const globals = { [BOOT_GLOBAL]: boot, [CURSOR_IMAGE_BASE_GLOBAL]: cursorImageBase() };
    await chrome.scripting.executeScript({ target, world: "MAIN", func: publishBoot, args: [globals] });
    await chrome.scripting.executeScript({ target, world: "MAIN", files: [INSPECTOR_BUNDLE] });
  }
  await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
}

async function reportUnavailable(tabId: number, error: unknown): Promise<void> {
  const reason = error instanceof Error ? error.message : String(error);
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#d93025" });
  await chrome.action.setBadgeText({ tabId, text: "!" });
  await chrome.action.setTitle({ tabId, title: `Nudge UI cannot run on this page: ${reason}` });
}

chrome.action.onClicked.addListener((tab) => {
  const tabId = tab.id;
  if (tabId === undefined) return;
  void toggleInspector({ ...tab, id: tabId }).catch((error: unknown) => reportUnavailable(tabId, error));
});
