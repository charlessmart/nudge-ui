import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { createNudgeUiEditorDocument, isNudgeUiEditorDocumentRequest } from "../transport/editor.ts";
import {
  NUDGE_UI_CLIENT_PATH,
  NUDGE_UI_EDITOR_PATH,
  NUDGE_UI_MANIFEST_PATH,
  NUDGE_UI_RELOAD_PATH,
} from "../transport/routes.ts";
import { handleHtmlArtifactRequest } from "./artifacts.ts";
import { handleFlowsRequest } from "./flows.ts";
import { handleLibraryVisibilityRequest } from "./libraryVisibility.ts";

const packageRequire = createRequire(import.meta.url);

/** Pushes manifest revisions to open editors. Hosts with their own hot-reload channel do not create one. */
export interface ReloadStream {
  /** Sends the current revision to every open editor. */
  publish(): void;
  /** Ends every open stream. */
  close(): void;
  /** Starts a stream on this response, opening with the current revision so a late subscriber misses nothing. */
  connect(request: IncomingMessage, response: ServerResponse): void;
}

/** `revision` reads the host's own counter, so a stream opened between two publishes still starts from the truth. */
export function createReloadStream(revision: () => number): ReloadStream {
  const clients = new Set<ServerResponse>();
  const send = (client: ServerResponse): void => {
    if (client.destroyed) {
      clients.delete(client);
      return;
    }
    try {
      client.write(`data: ${JSON.stringify({ revision: revision() })}\n\n`);
    } catch {
      clients.delete(client);
      client.destroy();
    }
  };
  return {
    publish() {
      for (const client of [...clients]) send(client);
    },
    close() {
      for (const client of clients) client.end();
      clients.clear();
    },
    connect(request, response) {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      clients.add(response);
      response.on("close", () => clients.delete(response));
      send(response);
    },
  };
}

export interface ReservedRouteOptions {
  /** The project that artifacts, flows and library visibility are read from and written to. */
  root(): string;
  /** The manifest the client configures itself from. */
  manifest(): object | Promise<object>;
  /** Vite hosts pass their index-HTML transform so editor and artifact documents load the dev client. */
  transformHtml?(url: string, html: string): Promise<string>;
  /** Whether the component library's visibility file is served. Off when omitted. */
  library?(): boolean;
  /** Omitted by hosts that refresh the editor over their own hot-reload channel. */
  reload?: ReloadStream;
  /** Replaces the packaged client bundle. */
  clientPath?: string;
}

/**
 * Answers every request under the reserved prefix that all hosts share, plus the editor document.
 * Resolves false when the request is not one of them, so the host can serve it or reject it.
 */
export function createReservedRoutes(
  options: ReservedRouteOptions,
): (request: IncomingMessage, response: ServerResponse) => Promise<boolean> {
  let defaultClientPath: string | undefined;
  const clientPath = (): string =>
    options.clientPath ?? (defaultClientPath ??= packageRequire.resolve("nudge-ui/internal/client"));

  return async (request, response) => {
    const root = options.root();
    const requestUrl = request.url ?? "/";
    const transformHtml = options.transformHtml;
    if (await handleHtmlArtifactRequest(
      request,
      response,
      root,
      transformHtml ? (html) => transformHtml(requestUrl, html) : undefined,
    )) return true;
    if (await handleFlowsRequest(request, response, root)) return true;
    if (options.library?.() && await handleLibraryVisibilityRequest(request, response, root)) return true;

    const pathname = new URL(requestUrl, "http://nudge-ui.local").pathname;
    const reserved = pathname === NUDGE_UI_EDITOR_PATH
      || pathname === NUDGE_UI_CLIENT_PATH
      || pathname === NUDGE_UI_MANIFEST_PATH
      || (options.reload !== undefined && pathname === NUDGE_UI_RELOAD_PATH);
    if (reserved && request.method !== "GET" && request.method !== "HEAD") {
      send(request, response, 405, "text/plain; charset=utf-8", "Method Not Allowed", { Allow: "GET, HEAD" });
      return true;
    }

    if (isNudgeUiEditorDocumentRequest(requestUrl, request.method, request.headers)) {
      const html = createNudgeUiEditorDocument();
      send(
        request,
        response,
        200,
        "text/html; charset=utf-8",
        request.method === "HEAD" || !transformHtml ? html : await transformHtml(requestUrl, html),
        { "Cache-Control": "no-store" },
      );
      return true;
    }
    if (pathname === NUDGE_UI_CLIENT_PATH) {
      await sendClient(request, response, clientPath);
      return true;
    }
    if (pathname === NUDGE_UI_MANIFEST_PATH) {
      send(request, response, 200, "application/json; charset=utf-8", JSON.stringify(await options.manifest()), {
        "Cache-Control": "no-store",
      });
      return true;
    }
    if (options.reload && pathname === NUDGE_UI_RELOAD_PATH) {
      options.reload.connect(request, response);
      return true;
    }
    return false;
  };
}

/** Read on every request so a rebuilt client is picked up; the tag lets the browser skip an unchanged download. */
async function sendClient(
  request: IncomingMessage,
  response: ServerResponse,
  clientPath: () => string,
): Promise<void> {
  let body: Buffer;
  let etag: string;
  try {
    const path = clientPath();
    const info = await stat(path);
    etag = `"${info.mtimeMs.toString(36)}-${info.size.toString(36)}"`;
    if (request.headers["if-none-match"] === etag) {
      response.statusCode = 304;
      response.setHeader("Cache-Control", "no-cache");
      response.setHeader("ETag", etag);
      response.end();
      return;
    }
    body = await readFile(path);
  } catch {
    send(
      request,
      response,
      503,
      "text/plain; charset=utf-8",
      "Nudge UI could not load its inspector client. Build nudge-ui (`pnpm --filter nudge-ui build`) "
        + "in a source workspace, or reinstall nudge-ui in an installed project.",
    );
    return;
  }
  send(request, response, 200, "text/javascript; charset=utf-8", body, { "Cache-Control": "no-cache", ETag: etag });
}

/** Sets status and headers one at a time: Connect-style hosts hand over responses that are mid-pipeline. */
function send(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string | Buffer,
  headers: Record<string, string> = {},
): void {
  response.statusCode = status;
  response.setHeader("Content-Type", contentType);
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.setHeader("X-Content-Type-Options", "nosniff");
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(request.method === "HEAD" ? undefined : body);
}
