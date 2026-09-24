import {
  NUDGE_UI_CLIENT_PATH,
  NUDGE_UI_DIRECT_QUERY_PARAM,
  NUDGE_UI_EDITOR_QUERY_PARAM,
  NUDGE_UI_EDITOR_QUERY_VALUE,
  NUDGE_UI_EDITOR_PATH,
  NUDGE_UI_MANIFEST_PATH,
  NUDGE_UI_MOUNT_ID,
  NUDGE_UI_OFF_QUERY_VALUE,
  NUDGE_UI_ON_QUERY_VALUE,
  isReservedNudgeUiRoute,
} from "./routes.ts";

const TARGET_QUERY_PARAM = "url";
const DIRECT_TAB_SESSION_KEY = "nudge-ui:direct-tab";
const FORCED_TAB_SESSION_KEY = "nudge-ui:forced-tab";

/** Returns the editor URL for one same-origin application location. */
export function createNudgeUiEditorUrl(applicationHref: string): string {
  const applicationUrl = new URL(applicationHref);
  assertApplicationUrl(applicationUrl);
  const retainedSegments = applicationUrl.search.slice(1).split("&").filter((segment) => {
    const entry = new URLSearchParams(segment);
    const value = entry.get(NUDGE_UI_EDITOR_QUERY_PARAM);
    return entry.get(NUDGE_UI_DIRECT_QUERY_PARAM) !== "1"
      && value !== NUDGE_UI_OFF_QUERY_VALUE
      && value !== NUDGE_UI_ON_QUERY_VALUE;
  });
  applicationUrl.search = retainedSegments.join("&");
  if (applicationUrl.searchParams.getAll(NUDGE_UI_EDITOR_QUERY_PARAM).includes(NUDGE_UI_EDITOR_QUERY_VALUE)) {
    return applicationUrl.href;
  }
  const hash = applicationUrl.hash;
  applicationUrl.hash = "";
  applicationUrl.search = `${applicationUrl.search}${applicationUrl.search ? "&" : "?"}${NUDGE_UI_EDITOR_QUERY_PARAM}=${NUDGE_UI_EDITOR_QUERY_VALUE}`;
  applicationUrl.hash = hash;
  return applicationUrl.href;
}

/** Resolves the application URL carried by an editor URL. */
export function readNudgeUiEditorTarget(editorHref: string): string | null {
  const editorUrl = new URL(editorHref);
  if (editorUrl.pathname !== NUDGE_UI_EDITOR_PATH) {
    if (!editorUrl.searchParams.getAll(NUDGE_UI_EDITOR_QUERY_PARAM).includes(NUDGE_UI_EDITOR_QUERY_VALUE)) {
      return null;
    }
    const retainedSegments = editorUrl.search.slice(1).split("&").filter((segment) => {
      const entry = new URLSearchParams(segment);
      return entry.get(NUDGE_UI_EDITOR_QUERY_PARAM) !== NUDGE_UI_EDITOR_QUERY_VALUE;
    });
    editorUrl.search = retainedSegments.join("&");
    return isApplicationUrl(editorUrl) ? editorUrl.href : null;
  }
  const target = editorUrl.searchParams.get(TARGET_QUERY_PARAM);
  if (!target) return null;
  try {
    const targetUrl = new URL(target, editorUrl.origin);
    return targetUrl.origin === editorUrl.origin && isApplicationUrl(targetUrl)
      ? targetUrl.href
      : null;
  } catch {
    return null;
  }
}

type RequestHeaderValue = string | readonly string[] | undefined;

/** Returns whether a host request should receive the pure editor document. */
export function isNudgeUiEditorDocumentRequest(
  requestHref: string,
  method: string | undefined,
  headers: Record<string, RequestHeaderValue> | undefined,
): boolean {
  const normalizedMethod = (method ?? "GET").toUpperCase();
  if (normalizedMethod !== "GET" && normalizedMethod !== "HEAD") return false;
  const url = new URL(requestHref, "http://nudge-ui.local");
  if (url.pathname === NUDGE_UI_EDITOR_PATH) return true;
  if (!isApplicationUrl(url)) return false;
  if (!url.searchParams.getAll(NUDGE_UI_EDITOR_QUERY_PARAM).includes(NUDGE_UI_EDITOR_QUERY_VALUE)) return false;
  const header = (name: string): string => {
    const value = headers?.[name] ?? headers?.[name.toLowerCase()];
    return typeof value === "string" ? value : value?.join(",") ?? "";
  };
  return header("sec-fetch-dest").toLowerCase() === "document"
    || header("accept").toLowerCase().includes("text/html");
}

/** Adds the persistent marker that bypasses editor entry for a plain app view. */
export function createNudgeUiDirectUrl(applicationHref: string): string {
  const url = new URL(applicationHref);
  assertApplicationUrl(url);
  url.searchParams.set(NUDGE_UI_DIRECT_QUERY_PARAM, "1");
  return url.href;
}

/** Reads the public `nudge-ui=off` / `nudge-ui=on` switch from an application URL. */
export function readNudgeUiQuerySwitch(href: string): "off" | "on" | null {
  const url = new URL(href);
  const values = url.searchParams.getAll(NUDGE_UI_EDITOR_QUERY_PARAM);
  if (values.includes(NUDGE_UI_OFF_QUERY_VALUE) || url.searchParams.get(NUDGE_UI_DIRECT_QUERY_PARAM) === "1") {
    return "off";
  }
  return values.includes(NUDGE_UI_ON_QUERY_VALUE) ? "on" : null;
}

/** Returns whether this application location explicitly bypasses editor entry. */
export function isNudgeUiDirectUrl(href: string): boolean {
  return readNudgeUiQuerySwitch(href) === "off";
}

/** Remembers that this browser tab was explicitly opened outside the editor. */
export function rememberNudgeUiDirectTabIntent(): void {
  rememberNudgeUiTabSwitch("off");
}

/** Remembers an explicit URL switch so later navigations in this tab keep it. */
export function rememberNudgeUiTabSwitch(value: "off" | "on"): void {
  try {
    sessionStorage.setItem(value === "off" ? DIRECT_TAB_SESSION_KEY : FORCED_TAB_SESSION_KEY, "1");
    sessionStorage.removeItem(value === "off" ? FORCED_TAB_SESSION_KEY : DIRECT_TAB_SESSION_KEY);
  } catch {
    // Storage denial must not prevent the current page from honoring the switch.
  }
}

/** Returns whether this browser tab should remain outside the editor. */
export function hasNudgeUiDirectTabIntent(): boolean {
  return readTabFlag(DIRECT_TAB_SESSION_KEY);
}

/** Returns whether this browser tab explicitly asked for the editor with `nudge-ui=on`. */
export function hasNudgeUiForcedTabIntent(): boolean {
  return readTabFlag(FORCED_TAB_SESSION_KEY);
}

function readTabFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export type NudgeUiClientEntry =
  | { readonly kind: "bootstrap" }
  | { readonly kind: "direct" }
  | { readonly kind: "redirect"; readonly href: string }
  /** An automated browser that enters the editor only when the host opts in. */
  | { readonly kind: "automated"; readonly href: string };

export interface NudgeUiClientEntryContext {
  readonly editorDocument: boolean;
  readonly canvasRenderer: boolean;
  readonly directTab?: boolean;
  readonly forcedTab?: boolean;
  /** `navigator.webdriver`: Playwright, Puppeteer, Selenium, and headless Chrome. */
  readonly automated?: boolean;
}

/** Chooses the browser-client role before any runtime manifest is fetched. */
export function resolveNudgeUiClientEntry(
  href: string,
  context: NudgeUiClientEntryContext,
): NudgeUiClientEntry {
  if (context.editorDocument || context.canvasRenderer) return { kind: "bootstrap" };
  const urlSwitch = readNudgeUiQuerySwitch(href);
  if (urlSwitch === "off") return { kind: "direct" };
  const forced = urlSwitch === "on" || context.forcedTab === true;
  if (!forced && context.directTab === true) return { kind: "direct" };
  const editorHref = createNudgeUiEditorUrl(href);
  if (context.automated === true && !forced) return { kind: "automated", href: editorHref };
  return { kind: "redirect", href: editorHref };
}

function isApplicationUrl(url: URL): boolean {
  return (url.protocol === "http:" || url.protocol === "https:")
    && url.username === ""
    && url.password === ""
    && !isReservedNudgeUiRoute(url.pathname);
}

function assertApplicationUrl(url: URL): void {
  if (!isApplicationUrl(url)) {
    throw new TypeError("Nudge UI application URLs must be HTTP(S) URLs outside its reserved route namespace.");
  }
}

/** Renders the host-neutral editor document served by every development Adapter. */
export function createNudgeUiEditorDocument(): string {
  return `<!doctype html>
<html lang="en" data-nudge-ui-editor>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nudge UI</title>
  <style>html,body,#${NUDGE_UI_MOUNT_ID}{width:100%;height:100%;margin:0}body{overflow:hidden}</style>
</head>
<body>
  <div id="${NUDGE_UI_MOUNT_ID}"></div>
  <script type="module" src="${NUDGE_UI_CLIENT_PATH}" data-nudge-ui-client data-nudge-ui-manifest="${NUDGE_UI_MANIFEST_PATH}"></script>
</body>
</html>`;
}
