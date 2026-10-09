import {
  BOOT_GLOBAL,
  CURSOR_IMAGE_BASE_GLOBAL,
  CURSOR_IMAGE_DIRECTORY,
  editorUrl,
  INJECT_RENDERERS_MESSAGE,
  isEditorUrl,
  PAGE_INSPECTOR_GLOBAL,
  siteKeyPrefix,
  type ExtensionBoot,
} from "./protocol.ts";

const INSPECTOR_BUNDLE = "nudge-ui.js";
const STORAGE_BRIDGE = "storage-bridge.js";

/**
 * `"opening"` while the tab reloads into the editor; `"editor"` once the
 * inspector runs there. Kept in session storage because the worker restarts.
 */
interface EditorTab {
  phase: "opening" | "editor";
  ruleIds: number[];
}

const editorTabKey = (tabId: number) => `editor-tab:${tabId}`;

/**
 * The editor discards the page it loads into, and starts only once that page
 * finishes loading, so the page's scripts and assets are blocked. Extension
 * scripts and resources are exempt; frames may load the application.
 */
const EDITOR_DOCUMENT_POLICY = [
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'none'",
  "media-src 'none'",
  "font-src 'none'",
  "object-src 'none'",
  "frame-src 'self'",
].join("; ");

async function readEditorTab(tabId: number): Promise<EditorTab | undefined> {
  const key = editorTabKey(tabId);
  return (await chrome.storage.session.get(key))[key] as EditorTab | undefined;
}

async function writeEditorTab(tabId: number, state: EditorTab): Promise<void> {
  await chrome.storage.session.set({ [editorTabKey(tabId)]: state });
}

/**
 * Lets this tab frame its own origin, and stops the application's scripts in
 * the editor document so only its renderer frames run it. Header rules take
 * effect only for origins the `activeTab` grant covers. Returns the rule IDs,
 * which must be unique across the extension and fit in 32 bits.
 */
async function installEditorRules(tabId: number, origin: string): Promise<number[]> {
  const existing = await chrome.declarativeNetRequest.getSessionRules();
  const firstId = Math.max(0, ...existing.map((rule) => rule.id)) + 1;
  const [frameRuleId, editorRuleId] = [firstId, firstId + 1];
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [
      {
        id: frameRuleId,
        condition: { tabIds: [tabId], resourceTypes: ["sub_frame"], urlFilter: `|${origin}/` },
        action: {
          type: "modifyHeaders",
          responseHeaders: [
            { header: "x-frame-options", operation: "remove" },
            { header: "content-security-policy", operation: "remove" },
          ],
        },
      },
      {
        id: editorRuleId,
        condition: { tabIds: [tabId], resourceTypes: ["main_frame"], urlFilter: "nudge-ui=editor" },
        action: {
          type: "modifyHeaders",
          responseHeaders: [{ header: "content-security-policy", operation: "set", value: EDITOR_DOCUMENT_POLICY }],
        },
      },
    ],
  });
  return [frameRuleId, editorRuleId];
}

async function closeEditor(tabId: number): Promise<void> {
  const state = await readEditorTab(tabId);
  if (!state) return;
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: state.ruleIds });
  await chrome.storage.session.remove(editorTabKey(tabId));
}

// `executeScript` serializes these functions into the page's main world, so
// they cannot close over module values; names arrive as arguments.
function toggleLoadedInspector(handleName: string): string | null {
  const handle = (window as unknown as Record<string, { surface: string; toggle(): void } | undefined>)[handleName];
  if (!handle) return null;
  handle.toggle();
  return handle.surface;
}

function publishGlobals(globals: Record<string, unknown>): void {
  Object.assign(window, globals);
}

function readDocument(handleName: string): { href: string; loaded: boolean } {
  return { href: location.href, loaded: handleName in window };
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

async function injectInspector(tabId: number, href: string, surface: ExtensionBoot["surface"]): Promise<void> {
  const target = { tabId };
  const boot: ExtensionBoot = { storage: await readSiteStorage(new URL(href).origin), surface };
  await chrome.scripting.executeScript({ target, files: [STORAGE_BRIDGE] });
  const globals = { [BOOT_GLOBAL]: boot, [CURSOR_IMAGE_BASE_GLOBAL]: cursorImageBase() };
  await chrome.scripting.executeScript({ target, world: "MAIN", func: publishGlobals, args: [globals] });
  await chrome.scripting.executeScript({ target, world: "MAIN", files: [INSPECTOR_BUNDLE] });
}

function needsRenderer(handleName: string): boolean {
  return window !== window.top && !(handleName in window);
}

/** The bundle starts a renderer only in Canvas frames and ignores every other frame. */
async function injectRenderers(tabId: number): Promise<void> {
  const probes = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true }, world: "MAIN", func: needsRenderer, args: [PAGE_INSPECTOR_GLOBAL],
  });
  const frameIds = probes.filter((probe) => probe.result === true).map((probe) => probe.frameId);
  if (frameIds.length === 0) return;
  const target = { tabId, frameIds };
  const globals = { [CURSOR_IMAGE_BASE_GLOBAL]: cursorImageBase() };
  await chrome.scripting.executeScript({ target, world: "MAIN", func: publishGlobals, args: [globals] });
  await chrome.scripting.executeScript({ target, world: "MAIN", files: [INSPECTOR_BUNDLE] });
}

async function toggleInspector(tab: chrome.tabs.Tab & { id: number }): Promise<void> {
  const tabId = tab.id;
  const [toggled] = await chrome.scripting.executeScript({
    target: { tabId }, world: "MAIN", func: toggleLoadedInspector, args: [PAGE_INSPECTOR_GLOBAL],
  });
  const surface = toggled?.result;
  if (surface === "editor") {
    await closeEditor(tabId);
  } else if (!surface) {
    if (!tab.url) throw new Error("the tab URL is unavailable");
    await closeEditor(tabId);
    const ruleIds = await installEditorRules(tabId, new URL(tab.url).origin);
    await writeEditorTab(tabId, { phase: "opening", ruleIds });
    await chrome.tabs.update(tabId, { url: editorUrl(tab.url) });
  }
  await chrome.action.setBadgeText({ tabId, text: "" });
}

/**
 * Starts the editor once its document loads, and covers reloads of it.
 * Renderer frame loads also complete the tab, so an existing inspector is left alone.
 */
async function resumeEditor(tabId: number): Promise<void> {
  const state = await readEditorTab(tabId);
  if (!state) return;
  const [result] = await chrome.scripting.executeScript({
    target: { tabId }, world: "MAIN", func: readDocument, args: [PAGE_INSPECTOR_GLOBAL],
  });
  if (!result?.result) throw new Error("the page cannot be scripted");
  const { href, loaded } = result.result;
  if (isEditorUrl(href)) {
    if (loaded) return;
    // Recorded first: renderer frames can load before the injection resolves.
    await writeEditorTab(tabId, { ...state, phase: "editor" });
    await injectInspector(tabId, href, "editor");
    return;
  }
  await closeEditor(tabId);
  // A redirect dropped the marker and the page ran normally; inspect it in place.
  if (state.phase === "opening") await injectInspector(tabId, href, "page");
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  void resumeEditor(tabId).catch(async (error: unknown) => {
    await closeEditor(tabId);
    await reportUnavailable(tabId, error);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void closeEditor(tabId);
});

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined || sender.frameId !== 0) return;
  if ((message as { type?: unknown } | null)?.type !== INJECT_RENDERERS_MESSAGE) return;
  void readEditorTab(tabId).then((state) => {
    if (state?.phase === "editor") return injectRenderers(tabId);
  }).catch((error: unknown) => console.warn("[nudge-ui] Could not load the inspector into the preview.", error));
});
