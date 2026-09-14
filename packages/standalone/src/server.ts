import { createHash } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  constants,
  existsSync,
  realpathSync,
  statSync,
} from "node:fs";
import { open, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { instrumentHtml } from "./html/identity.ts";
import { injectStandaloneBootstrap } from "./html/bootstrap.ts";
import {
  createStandaloneRuntimeManifest,
  NUDGE_UI_CLIENT_PATH,
  NUDGE_UI_MANIFEST_PATH,
  NUDGE_UI_RELOAD_PATH,
  NUDGE_UI_ROUTE_PREFIX,
  type StandaloneRuntimeManifest,
} from "./manifest.ts";
import { createProjectTokenSnapshot, EMPTY_PROJECT_TOKEN_SNAPSHOT } from "nudge-ui/project-tokens";
import {
  createProjectFileWatcher,
  isSensitiveProjectPath,
  type ProjectFileChange,
  type ProjectFileWatcher,
} from "nudge-ui/project-files";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const DEFAULT_PORT = 4173;
const packageRequire = createRequire(import.meta.url);

/** Options for the loopback-only standalone static server. */
export interface StandaloneServerOptions {
  /** The explicit directory whose files may be served. */
  readonly rootDirectory: string;
  /** The loopback address to bind. Defaults to `127.0.0.1`. */
  readonly host?: "127.0.0.1" | "::1" | "localhost";
  /** The TCP port. Use `0` to ask the operating system for an available port. */
  readonly port?: number;
  /** The prebuilt browser client artifact. */
  readonly clientPath?: string;
  /** Override the deterministic project identity in tests or embedding hosts. */
  readonly projectId?: string;
  /** Debounce interval for source changes before one reload revision. */
  readonly watchDebounceMs?: number;
}

/** A canonical file resolved below the configured project root. */
export interface StaticFileResolution {
  /** The canonical file path on disk. */
  readonly absolutePath: string;
  /** The slash-separated project-relative path used for source identity. */
  readonly projectPath: string;
}

/** The address returned after the server starts listening. */
export interface StandaloneServerAddress {
  readonly host: string;
  readonly port: number;
  readonly url: string;
}

/** The running standalone server and its lifecycle methods. */
export interface StandaloneServer {
  readonly httpServer: Server;
  readonly rootDirectory: string;
  readonly projectId: string;
  readonly manifest: StandaloneRuntimeManifest;
  start(): Promise<StandaloneServerAddress>;
  close(): Promise<void>;
}

/**
 * Creates a Nudge UI-owned static server for one explicit project root.
 *
 * The server binds to loopback, reserves its own route namespace, and only
 * reads prototype files. HTML instrumentation and bootstrap nodes exist in
 * response memory; the configured source directory is never rewritten.
 *
 * @param options Server root, address, port, and client artifact options.
 * @returns A server that has not started listening yet.
 * @throws If the root is missing, not a directory, or the host is not loopback.
 */
export function createStandaloneServer(options: StandaloneServerOptions): StandaloneServer {
  const rootDirectory = canonicalDirectory(options.rootDirectory);
  const host = options.host ?? "127.0.0.1";
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(`Standalone server host must be loopback; received ${host}.`);
  }
  const port = options.port ?? DEFAULT_PORT;
  validatePort(port);
  const clientPath = options.clientPath;
  const projectId = options.projectId ?? createStandaloneProjectId(rootDirectory);
  let revision = 0;
  let manifest = createStandaloneRuntimeManifest(
    projectId,
    EMPTY_PROJECT_TOKEN_SNAPSHOT,
    revision,
  );
  // The initial scan runs asynchronously; start() awaits it so the first
  // request and manifest always observe the complete project token knowledge.
  const initialTokens = createProjectTokenSnapshot({ rootDirectory, generationLabel: "static-html" }).then((tokens) => {
    manifest = createStandaloneRuntimeManifest(projectId, tokens, revision);
    return tokens;
  });
  // start() awaits and surfaces scan failures; this second handler only
  // prevents an unhandled rejection when a server is created but never started.
  void initialTokens.catch(() => undefined);
  const reloadClients = new Set<ServerResponse>();
  let fileWatcher: ProjectFileWatcher | null = null;
  let changeQueue = Promise.resolve();

  const getManifest = (): StandaloneRuntimeManifest => manifest;
  const closeReloadClients = (): void => {
    for (const client of reloadClients) {
      client.end();
    }
    reloadClients.clear();
  };
  const notifyReload = (): void => {
    const payload = `event: reload\ndata: ${JSON.stringify({ revision })}\n\n`;
    for (const client of [...reloadClients]) {
      if (client.destroyed) {
        reloadClients.delete(client);
        continue;
      }
      try {
        client.write(payload);
      } catch {
        reloadClients.delete(client);
        client.destroy();
      }
    }
  };
  const processSettledChanges = (_changes: readonly ProjectFileChange[]): void => {
    changeQueue = changeQueue.then(async () => {
      // Rebuild every settled batch. fs.watch can report a directory or omit a
      // filename, so an extension check cannot reliably identify CSS changes.
      // The scan is asynchronous and bounded to the project root; rebuilding
      // once per settled batch keeps the manifest coherent before reload.
      const tokens = await createProjectTokenSnapshot({ rootDirectory, generationLabel: "static-html" });
      manifest = createStandaloneRuntimeManifest(projectId, tokens, revision + 1);
      revision += 1;
      notifyReload();
    }).catch((error: unknown) => {
      // A later settled batch can still rebuild the snapshot after a failed
      // callback. Source edits must not terminate the static server, but a
      // skipped reload must be visible to the developer.
      console.warn(
        "Nudge UI standalone reload was skipped because rebuilding token knowledge failed:",
        error,
      );
    });
  };
  const httpServer = createServer((request, response) => {
    void handleRequest({
      request,
      response,
      rootDirectory,
      clientPath,
      getManifest,
      reloadClients,
    }).catch(() => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      sendText(response, 500, "Internal Server Error");
    });
  });

  let started = false;
  let startPromise: Promise<StandaloneServerAddress> | null = null;
  let closePromise: Promise<void> | null = null;
  let closeRequested = false;

  const server: StandaloneServer = {
    httpServer,
    rootDirectory,
    projectId,
    get manifest() {
      return manifest;
    },
    start: () => {
      if (closeRequested) {
        return Promise.reject(new Error("Standalone server is closing."));
      }
      if (started) return Promise.resolve(readAddress(httpServer, host));
      if (startPromise) return startPromise;
      startPromise = initialTokens.then(() => new Promise<StandaloneServerAddress>(
        (resolveStart, rejectStart) => {
          const onError = (error: Error) => {
            httpServer.off("listening", onListening);
            startPromise = null;
            rejectStart(error);
          };
          const onListening = () => {
            httpServer.off("error", onError);
            started = true;
            if (closeRequested) {
              rejectStart(new Error("Standalone server closed during startup."));
              return;
            }
            fileWatcher = createProjectFileWatcher({
              rootDirectory,
              debounceMs: options.watchDebounceMs,
              onSettled: processSettledChanges,
            });
            void fileWatcher.start().then(() => {
              if (closeRequested) {
                rejectStart(new Error("Standalone server closed during startup."));
                return;
              }
              resolveStart(readAddress(httpServer, host));
            });
          };
          httpServer.once("error", onError);
          httpServer.once("listening", onListening);
          httpServer.listen(port, host);
        },
      ));
      return startPromise;
    },
    close: () => {
      if (closePromise) return closePromise;
      closeRequested = true;
      const pendingStart = startPromise;
      const closeWatcher = fileWatcher?.close() ?? Promise.resolve();
      fileWatcher = null;
      closeReloadClients();
      const closing = closeWatcher
        .then(() => pendingStart?.catch(() => undefined))
        .then(() => changeQueue)
        .then(() => {
          if (!httpServer.listening) return;
          return new Promise<void>((resolveClose, rejectClose) => {
            httpServer.close((error) => {
              if (error) rejectClose(error);
              else resolveClose();
            });
          });
        })
        .finally(() => {
          started = false;
          startPromise = null;
          fileWatcher = null;
          closeRequested = false;
          closePromise = null;
        });
      closePromise = closing;
      return closing;
    },
  };
  return server;
}

/**
 * Resolves one URL pathname to a canonical file under the project root.
 *
 * URL decoding occurs before path normalization, which makes encoded dot
 * segments subject to the same confinement check as ordinary traversal. The
 * canonical existing ancestor check also rejects a symlink that escapes the
 * root when the requested leaf does not yet exist. Hidden path segments are
 * refused, including encoded and multiply encoded forms, and a visible
 * symlink cannot be used to reach a hidden target.
 *
 * @param rootDirectory The configured project root.
 * @param requestPath A request target or URL pathname.
 * @returns A file resolution, or `null` for malformed, missing, or unsafe paths.
 */
export function resolveStaticFile(
  rootDirectory: string,
  requestPath: string,
): StaticFileResolution | null {
  const root = canonicalDirectoryOrNull(rootDirectory);
  if (!root) return null;
  const decodedPath = decodeRequestPath(requestPath);
  if (!decodedPath) return null;
  return resolveDecodedStaticFile(root, decodedPath);
}

function resolveDecodedStaticFile(
  root: string,
  decodedPath: string,
): StaticFileResolution | null {
  const projectPath = decodedPath.replace(/^\/+/, "") || "index.html";
  if (isSensitiveProjectPath(projectPath) || hasNestedUnsafePathEncoding(decodedPath)) {
    return null;
  }
  const candidate = resolve(root, projectPath);
  if (!isWithin(root, candidate)) return null;

  const canonicalCandidate = canonicalExistingAncestor(candidate);
  if (!canonicalCandidate || !isWithin(root, canonicalCandidate)) return null;
  if (!existsSync(candidate)) return null;

  let filePath = canonicalCandidate;
  const stats = statSync(filePath);
  if (stats.isDirectory()) {
    const indexCandidate = join(filePath, "index.html");
    const canonicalIndex = canonicalExistingAncestor(indexCandidate);
    if (!canonicalIndex || !isWithin(root, canonicalIndex) || !existsSync(indexCandidate)) {
      return null;
    }
    if (!statSync(canonicalIndex).isFile()) return null;
    filePath = canonicalIndex;
  } else if (!stats.isFile()) {
    return null;
  }

  const relativePath = relative(root, filePath).split("\\").join("/");
  if (isSensitiveProjectPath(relativePath)) return null;
  return { absolutePath: filePath, projectPath: relativePath };
}

/** Returns the deterministic project identity used for session persistence. */
export function createStandaloneProjectId(rootDirectory: string): string {
  const canonicalRoot = canonicalDirectory(rootDirectory);
  const digest = createHash("sha256").update(canonicalRoot).digest("hex").slice(0, 24);
  return `static-html:${digest}`;
}

/** Returns a common response content type for a project-relative file. */
export function contentTypeForPath(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  return MIME_TYPES[extension] ?? "application/octet-stream";
}

/** Returns whether a decoded pathname belongs to the server-owned route space. */
export function isReservedNudgeUiRoute(pathname: string): boolean {
  return pathname === NUDGE_UI_ROUTE_PREFIX.slice(0, -1)
    || pathname.startsWith(NUDGE_UI_ROUTE_PREFIX);
}

function canonicalDirectory(directory: string): string {
  const canonical = canonicalDirectoryOrNull(directory);
  if (!canonical) throw new Error(`Standalone root is not a readable directory: ${directory}`);
  return canonical;
}

function canonicalDirectoryOrNull(directory: string): string | null {
  if (!isAbsolute(directory)) return null;
  try {
    const canonical = realpathSync(directory);
    return statSync(canonical).isDirectory() ? canonical : null;
  } catch {
    return null;
  }
}

function decodeRequestPath(requestPath: string): string | null {
  const separator = requestPath.search(/[?#]/);
  const rawPath = separator >= 0 ? requestPath.slice(0, separator) : requestPath;
  if (!rawPath.startsWith("/") || rawPath.startsWith("//") || rawPath.includes("\\")) {
    return null;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (!pathname.startsWith("/") || pathname.includes("\0") || pathname.includes("\\")) {
    return null;
  }
  if (pathname.split("/").some((segment) => segment === "..")) return null;
  return pathname;
}

/**
 * Detects suspicious paths that become hidden or traversal paths after a
 * second URL decode. The server resolves request URLs exactly once so literal
 * percent-containing filenames continue to work, but nested encodings must
 * not provide an alternate spelling for a sensitive path.
 */
function hasNestedUnsafePathEncoding(pathname: string): boolean {
  let candidate = pathname;
  for (let depth = 0; depth < 5; depth += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(candidate);
    } catch {
      return false;
    }
    if (decoded === candidate) return false;
    if (
      decoded.includes("\0")
      || decoded.includes("\\")
      || decoded.split("/").some((segment) => segment === "..")
      || isSensitiveProjectPath(decoded.replace(/^\/+/, ""))
    ) {
      return true;
    }
    candidate = decoded;
  }
  return false;
}

function canonicalExistingAncestor(candidate: string): string | null {
  let current = candidate;
  while (true) {
    try {
      return realpathSync(current);
    } catch (error) {
      if (!isMissingPathError(error)) return null;
      const parent = dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
}

function isMissingPathError(error: unknown): boolean {
  // SAFETY: The `in` guard below proves the node error object has a code field.
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "ENOENT";
}

function isWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

async function handleRequest(input: {
  request: IncomingMessage;
  response: ServerResponse;
  rootDirectory: string;
  clientPath?: string;
  getManifest: () => StandaloneRuntimeManifest;
  reloadClients: Set<ServerResponse>;
}): Promise<void> {
  const { request, response } = input;
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
    return;
  }

  const decodedPath = decodeRequestPath(request.url ?? "/");
  if (!decodedPath) {
    sendText(response, 400, "Bad Request");
    return;
  }

  if (isReservedNudgeUiRoute(decodedPath)) {
    await handleNudgeUiRoute(input, decodedPath);
    return;
  }

  const resolution = resolveDecodedStaticFile(input.rootDirectory, decodedPath);
  if (!resolution) {
    sendText(response, 404, "Not Found");
    return;
  }

  const isHtml = HTML_EXTENSIONS.has(extname(resolution.projectPath).toLowerCase());
  const contentType = contentTypeForPath(resolution.projectPath);

  if (request.method === "HEAD") {
    // HEAD answers headers without running the response transform: the body
    // would be discarded anyway, and the instrumented GET length cannot be
    // known without performing it. Content-Length is omitted for HTML so the
    // header cannot disagree with a subsequent GET body; untransformed files
    // report their exact length.
    const body = await readProjectFile(resolution.absolutePath);
    if (isHtml) {
      response.writeHead(200, {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
      });
      response.end();
    } else {
      sendBody(response, 200, body, contentType);
    }
    return;
  }

  let body = await readProjectFile(resolution.absolutePath);
  if (isHtml) {
    body = instrumentHtmlResponse(body, resolution.projectPath);
  }
  sendBody(response, 200, body, contentType, isHtml ? { "Cache-Control": "no-cache" } : {});
}

/**
 * Instruments one HTML response while guaranteeing byte preservation.
 *
 * The identity inserter only edits the decoded string at parser offsets, so
 * the decode itself must be lossless. A non-UTF-8 document cannot round-trip
 * through `toString("utf8")` without replacing every invalid sequence with
 * U+FFFD, so such documents are served untouched with a warning instead of
 * being silently corrupted.
 */
function instrumentHtmlResponse(body: Buffer, projectPath: string): Buffer {
  let source: string;
  try {
    source = strictUtf8Decoder.decode(body);
  } catch {
    console.warn(
      `Nudge UI served ${projectPath} without instrumentation because it is not valid UTF-8.`,
    );
    return body;
  }
  const identified = instrumentHtml(source, projectPath);
  const bootstrapped = injectStandaloneBootstrap(identified.html);
  return Buffer.from(bootstrapped.html, "utf8");
}

const strictUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

async function handleNudgeUiRoute(
  input: {
    request: IncomingMessage;
    response: ServerResponse;
    clientPath?: string;
    getManifest: () => StandaloneRuntimeManifest;
    reloadClients: Set<ServerResponse>;
  },
  pathname: string,
): Promise<void> {
  if (pathname === NUDGE_UI_MANIFEST_PATH) {
    const body = Buffer.from(JSON.stringify(input.getManifest()), "utf8");
    sendBody(input.response, 200, body, "application/json; charset=utf-8", {
      "Cache-Control": "no-store",
    });
    return;
  }
  if (pathname === NUDGE_UI_CLIENT_PATH) {
    try {
      const body = await readFileFromDescriptor(input.clientPath ?? resolveDefaultClientPath());
      sendBody(input.response, 200, body, "text/javascript; charset=utf-8", {
        "Cache-Control": "no-cache",
      });
    } catch {
      sendText(input.response, 503, "Nudge UI client has not been built.");
    }
    return;
  }
  if (pathname === NUDGE_UI_RELOAD_PATH) {
    if (input.request.method === "HEAD") {
      sendBody(input.response, 200, Buffer.alloc(0), "text/event-stream; charset=utf-8", {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      return;
    }
    input.response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    input.response.write(
      `event: ready\ndata: ${JSON.stringify({ revision: input.getManifest().revision })}\n\n`,
    );
    input.reloadClients.add(input.response);
    input.request.on("close", () => input.reloadClients.delete(input.response));
    input.response.on("close", () => input.reloadClients.delete(input.response));
    return;
  }
  sendText(input.response, 404, "Not Found");
}

const READ_ONLY_NOFOLLOW_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;

async function readProjectFile(filePath: string): Promise<Buffer> {
  const expectedStats = await stat(filePath);
  return readFileFromDescriptor(filePath, {
    flags: READ_ONLY_NOFOLLOW_FLAGS,
    expectedStats,
  });
}

async function readFileFromDescriptor(
  filePath: string,
  options: {
    readonly flags?: number;
    readonly expectedStats?: Awaited<ReturnType<typeof stat>>;
  } = {},
): Promise<Buffer> {
  const fileHandle = await open(filePath, options.flags ?? constants.O_RDONLY);
  try {
    const actualStats = await fileHandle.stat();
    if (!actualStats.isFile()) {
      throw new Error(`Expected a regular file: ${filePath}`);
    }
    if (options.expectedStats
      && (actualStats.dev !== options.expectedStats.dev
        || actualStats.ino !== options.expectedStats.ino)) {
      throw new Error(`File changed while it was being resolved: ${filePath}`);
    }
    return await fileHandle.readFile();
  } finally {
    await fileHandle.close();
  }
}

function resolveDefaultClientPath(): string {
  return packageRequire.resolve("@nudge-ui/inspector/client");
}

function readAddress(server: Server, host: string): StandaloneServerAddress {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Standalone server did not expose a TCP address after listening.");
  }
  const displayHost = host === "::1" ? `[${host}]` : host;
  return { host, port: address.port, url: `http://${displayHost}:${address.port}/` };
}

function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Standalone server port must be an integer from 0 to 65535; received ${port}.`);
  }
}

function sendText(
  response: ServerResponse,
  status: number,
  text: string,
  headers: Record<string, string> = {},
): void {
  sendBody(response, status, Buffer.from(text, "utf8"), "text/plain; charset=utf-8", headers);
}

function sendBody(
  response: ServerResponse,
  status: number,
  body: Buffer,
  contentType: string,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": body.byteLength,
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  if (response.req?.method !== "HEAD") response.end(body);
  else response.end();
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};
