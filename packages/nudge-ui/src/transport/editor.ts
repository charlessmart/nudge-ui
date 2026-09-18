import {
  NUDGE_UI_CLIENT_PATH,
  NUDGE_UI_DIRECT_QUERY_PARAM,
  NUDGE_UI_EDITOR_QUERY_PARAM,
  NUDGE_UI_EDITOR_QUERY_VALUE,
  NUDGE_UI_EDITOR_PATH,
  NUDGE_UI_MANIFEST_PATH,
  NUDGE_UI_MOUNT_ID,
  isReservedNudgeUiRoute,
} from "./routes.ts";

const TARGET_QUERY_PARAM = "url";

/** Returns the editor URL for one same-origin application location. */
export function createNudgeUiEditorUrl(applicationHref: string): string {
  const applicationUrl = new URL(applicationHref);
  assertApplicationUrl(applicationUrl);
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

/** Returns whether this application location explicitly bypasses editor entry. */
export function isNudgeUiDirectUrl(href: string): boolean {
  const url = new URL(href);
  return url.searchParams.get(NUDGE_UI_DIRECT_QUERY_PARAM) === "1";
}

export type NudgeUiClientEntry =
  | { readonly kind: "bootstrap" }
  | { readonly kind: "direct" }
  | { readonly kind: "redirect"; readonly href: string };

/** Chooses the browser-client role before any runtime manifest is fetched. */
export function resolveNudgeUiClientEntry(
  href: string,
  editorDocument: boolean,
  canvasRenderer: boolean,
  directTab = false,
): NudgeUiClientEntry {
  if (editorDocument || canvasRenderer) return { kind: "bootstrap" };
  if (isNudgeUiDirectUrl(href) || directTab) return { kind: "direct" };
  return { kind: "redirect", href: createNudgeUiEditorUrl(href) };
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
