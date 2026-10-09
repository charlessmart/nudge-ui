const INSPECTOR_BUNDLE = "nudge-ui.js";

interface InspectorWindow extends Window {
  __NUDGE_UI_BOOKMARKLET__?: { toggle(): void };
  __NUDGE_UI_SURFACE__?: string;
}

/**
 * Runs in the page's main world. Toggles a loaded inspector; otherwise asks
 * the bundle for the page surface, where the page itself is the only Canvas
 * card and no framing permission is needed.
 */
function toggleLoadedInspector(): boolean {
  const page = window as InspectorWindow;
  const loaded = page.__NUDGE_UI_BOOKMARKLET__;
  if (loaded) {
    loaded.toggle();
    return true;
  }
  page.__NUDGE_UI_SURFACE__ = "page";
  return false;
}

async function toggleInspector(tabId: number): Promise<void> {
  const target = { tabId };
  const [toggled] = await chrome.scripting.executeScript({ target, world: "MAIN", func: toggleLoadedInspector });
  if (toggled?.result !== true) {
    await chrome.scripting.executeScript({ target, world: "MAIN", files: [INSPECTOR_BUNDLE] });
  }
  await chrome.action.setBadgeText({ tabId, text: "" });
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
  void toggleInspector(tabId).catch((error: unknown) => reportUnavailable(tabId, error));
});
