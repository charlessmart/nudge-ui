import {
  BOOT_GLOBAL,
  CURSOR_IMAGE_BASE_GLOBAL,
  CURSOR_IMAGE_DIRECTORY,
  editorUrl,
  applicationUrl,
  INJECT_RENDERERS_MESSAGE,
  isEditorUrl,
  PAGE_INSPECTOR_GLOBAL,
  siteKeyPrefix,
  type ExtensionBoot,
} from "./protocol.ts";
import { EDITOR_DOCUMENT_POLICY } from "./editorPolicy.ts";

const INSPECTOR_BUNDLE = "nudge-ui.js";
const STORAGE_BRIDGE = "storage-bridge.js";
/** Marks the document a toggle navigates away from, so its late load events are ignored. */
const LEAVING_GLOBAL = "__NUDGE_UI_LEAVING__";

/** `"opening"` while the tab reloads into the editor, `"editor"` once the inspector runs there; session storage survives worker restarts. */
interface EditorTab {
  phase: "opening" | "editor";
  ruleIds: number[];
  applicationHref?: string;
}

const editorTabKey = (tabId: number) => `editor-tab:${tabId}`;
const tabTasks = new Map<number, Promise<void>>();
let ruleUpdates: Promise<unknown> = Promise.resolve();

/** Serializes lifecycle events for one tab without delaying other tabs. */
function queueTabTask(tabId: number, task: () => Promise<void>): Promise<void> {
  const pending = (tabTasks.get(tabId) ?? Promise.resolve()).catch(() => undefined).then(task);
  tabTasks.set(tabId, pending);
  const remove = (): void => {
    if (tabTasks.get(tabId) === pending) tabTasks.delete(tabId);
  };
  void pending.then(remove, remove);
  return pending;
}

async function readEditorTab(tabId: number): Promise<EditorTab | undefined> {
  const key = editorTabKey(tabId);
  return (await chrome.storage.session.get(key))[key] as EditorTab | undefined;
}

async function writeEditorTab(tabId: number, state: EditorTab): Promise<void> {
  await chrome.storage.session.set({ [editorTabKey(tabId)]: state });
}

/** Lets the tab frame its own origin and stops the application's scripts in the editor document; header rules apply only where `activeTab` covers the origin. */
async function installEditorRules(tabId: number, origin: string): Promise<number[]> {
  const pending = ruleUpdates.then(() => addEditorRules(tabId, origin));
  ruleUpdates = pending.catch(() => undefined);
  return pending;
}

async function addEditorRules(tabId: number, origin: string): Promise<number[]> {
  const existing = await chrome.declarativeNetRequest.getSessionRules();
  const firstId = Math.max(0, ...existing.map((rule) => rule.id)) + 1;
  const [frameRuleId, policyRuleId, editorRuleId] = [firstId, firstId + 1, firstId + 2];
  const frameCondition = { tabIds: [tabId], resourceTypes: ["sub_frame" as const], urlFilter: `|${origin}/` };
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [
      {
        id: frameRuleId,
        condition: frameCondition,
        action: { type: "modifyHeaders", responseHeaders: [{ header: "x-frame-options", operation: "remove" }] },
      },
      {
        // Rules cannot edit one directive, so a policy is dropped only when it
        // restricts framing; any other policy still applies in the frame.
        id: policyRuleId,
        condition: {
          ...frameCondition,
          responseHeaders: [{ header: "content-security-policy", values: ["*frame-ancestors*"] }],
        },
        action: { type: "modifyHeaders", responseHeaders: [{ header: "content-security-policy", operation: "remove" }] },
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
  return [frameRuleId, policyRuleId, editorRuleId];
}

async function closeEditor(tabId: number): Promise<void> {
  const state = await readEditorTab(tabId);
  if (!state) return;
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: state.ruleIds });
  await chrome.storage.session.remove(editorTabKey(tabId));
}

// `executeScript` serializes these functions into the page's main world, so
// they cannot close over module values; names arrive as arguments.
function toggleLoadedInspector(handleName: string, leavingName: string): string | null {
  const handle = (window as unknown as Record<string, { surface: string; toggle(): void } | undefined>)[handleName];
  if (!handle) {
    // The caller now reloads this tab into the editor.
    Object.assign(window, { [leavingName]: true });
    return null;
  }
  handle.toggle();
  return handle.surface;
}

function publishGlobals(globals: Record<string, unknown>): void {
  Object.assign(window, globals);
}

function readDocument(handleName: string, leavingName: string): {
  href: string; loaded: boolean; leaving: boolean; unavailableReason?: string;
} {
  const blocksFrames = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[http-equiv="Content-Security-Policy" i]')).some((meta) => {
    const directives = meta.content.split(";").map((directive) => directive.trim().split(/\s+/));
    const frameSources = directives.find(([name]) => name?.toLowerCase() === "frame-src")
      ?? directives.find(([name]) => name?.toLowerCase() === "child-src")
      ?? directives.find(([name]) => name?.toLowerCase() === "default-src");
    return frameSources?.length === 2 && frameSources[1] === "'none'";
  });
  // Navigation responses generated by site workers bypass the header rules.
  // Leave these pages running normally and show the limitation in the panel.
  const unavailableReason = navigator.serviceWorker?.controller
    ? "its service worker"
    : blocksFrames ? "its security policy" : undefined;
  return {
    href: location.href, loaded: handleName in window, leaving: leavingName in window,
    ...(unavailableReason ? { unavailableReason } : {}),
  };
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

async function injectInspector(
  tabId: number, documentId: string, href: string, surface: ExtensionBoot["surface"], unavailableReason?: string,
): Promise<void> {
  const target = { tabId, documentIds: [documentId] };
  const boot: ExtensionBoot = {
    storage: await readSiteStorage(new URL(href).origin), surface,
    ...(unavailableReason ? { unavailableReason } : {}),
  };
  try {
    await chrome.scripting.executeScript({ target, files: [STORAGE_BRIDGE] });
    const globals = { [BOOT_GLOBAL]: boot, [CURSOR_IMAGE_BASE_GLOBAL]: cursorImageBase() };
    await chrome.scripting.executeScript({ target, world: "MAIN", func: publishGlobals, args: [globals] });
    await chrome.scripting.executeScript({ target, world: "MAIN", files: [INSPECTOR_BUNDLE] });
  } catch (error) {
    const [current] = await chrome.scripting.executeScript({
      target: { tabId }, world: "MAIN", func: readDocument,
      args: [PAGE_INSPECTOR_GLOBAL, LEAVING_GLOBAL], injectImmediately: true,
    }).catch(() => []);
    // A navigation invalidates this injection; its own completion resumes the editor.
    if (current?.documentId !== documentId) return;
    throw error;
  }
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
  const state = await readEditorTab(tabId);
  if (state?.phase === "opening") {
    const href = state.applicationHref ?? (tab.url ? applicationUrl(tab.url) : undefined);
    if (!href) throw new Error("the page URL is unavailable");
    await closeEditor(tabId);
    await chrome.tabs.update(tabId, { url: href });
    return;
  }
  const [document] = await chrome.scripting.executeScript({
    target: { tabId }, world: "MAIN", func: readDocument,
    args: [PAGE_INSPECTOR_GLOBAL, LEAVING_GLOBAL], injectImmediately: true,
  });
  if (!document?.result) throw new Error("the page cannot be scripted");
  const { href, loaded, unavailableReason } = document.result;
  if (state && !loaded) {
    await closeEditor(tabId);
    await chrome.tabs.update(tabId, { url: applicationUrl(href) });
    return;
  }
  if (!loaded && unavailableReason) {
    await injectInspector(tabId, document.documentId, href, "page", unavailableReason);
    return;
  }
  const [toggled] = await chrome.scripting.executeScript({
    target: { tabId, documentIds: [document.documentId] }, world: "MAIN", func: toggleLoadedInspector,
    args: [PAGE_INSPECTOR_GLOBAL, LEAVING_GLOBAL],
  });
  const surface = toggled?.result;
  if (surface === "editor") {
    await closeEditor(tabId);
  } else if (!surface) {
    await closeEditor(tabId);
    const ruleIds = await installEditorRules(tabId, new URL(href).origin);
    await writeEditorTab(tabId, { phase: "opening", ruleIds, applicationHref: applicationUrl(href) });
    await chrome.tabs.update(tabId, { url: editorUrl(href) });
  }
}

/** Starts the editor once its document loads, covering reloads; renderer frame loads also complete the tab. */
async function resumeEditor(tabId: number): Promise<void> {
  const state = await readEditorTab(tabId);
  if (!state) return;
  const [result] = await chrome.scripting.executeScript({
    target: { tabId }, world: "MAIN", func: readDocument, args: [PAGE_INSPECTOR_GLOBAL, LEAVING_GLOBAL],
    injectImmediately: true,
  }).catch((error: unknown) => {
    // A queued completion can belong to the document being replaced. Its
    // replacement's completion will resume the editor with the rules intact.
    if (error instanceof Error && error.message === "Frame with ID 0 was removed.") return [];
    throw error;
  });
  if (!result?.result) return;
  const { href, loaded, leaving, unavailableReason } = result.result;
  // A page still loading when toggled can complete after the editor state is
  // recorded; only the next document's load decides the outcome.
  if (leaving) return;
  if (isEditorUrl(href)) {
    if (loaded) return;
    // Recorded first: renderer frames can load before the injection resolves.
    await writeEditorTab(tabId, { ...state, phase: "editor" });
    await injectInspector(tabId, result.documentId, href, "editor", unavailableReason);
    return;
  }
  await closeEditor(tabId);
  // A redirect dropped the marker and the page ran normally; inspect it in place.
  if (state.phase === "opening") await injectInspector(tabId, result.documentId, href, "page", unavailableReason);
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
  void queueTabTask(tabId, async () => {
    try {
      await toggleInspector({ ...tab, id: tabId });
      await chrome.action.setBadgeText({ tabId, text: "" });
      // Clear any failure left by an earlier attempt on this tab.
      await chrome.action.setTitle({ tabId, title: chrome.runtime.getManifest().action?.default_title ?? "Nudge UI" });
    } catch (error) {
      await reportUnavailable(tabId, error);
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  void queueTabTask(tabId, async () => {
    try {
      await resumeEditor(tabId);
    } catch (error) {
      await closeEditor(tabId);
      await reportUnavailable(tabId, error);
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void queueTabTask(tabId, () => closeEditor(tabId));
});

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined || sender.frameId !== 0) return;
  if ((message as { type?: unknown } | null)?.type !== INJECT_RENDERERS_MESSAGE) return;
  void readEditorTab(tabId).then((state) => {
    if (state?.phase === "editor") return injectRenderers(tabId);
  }).catch((error: unknown) => console.warn("[nudge-ui] Could not load the inspector into the preview.", error));
});
