import { createHash } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { instrumentHtml } from "./html/identity.ts";
import { injectStandaloneBootstrap } from "./html/bootstrap.ts";
import {
  createStandaloneRuntimeManifest,
  DESIGN_TOOL_CLIENT_PATH,
  DESIGN_TOOL_MANIFEST_PATH,
  DESIGN_TOOL_ROUTE_PREFIX,
  type StandaloneRuntimeManifest,
} from "./manifest.ts";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const DEFAULT_PORT = 4173;
const DEFAULT_CLIENT_FILE_NAMES = ["client.mjs", "../dist/client.mjs"] as const;

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
 * Creates a Design Tool-owned static server for one explicit project root.
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
  const clientPath = options.clientPath ?? resolveDefaultClientPath();
  const projectId = options.projectId ?? createStandaloneProjectId(rootDirectory);
  const manifest = createStandaloneRuntimeManifest(projectId);
  const httpServer = createServer((request, response) => {
    void handleRequest({
      request,
      response,
      rootDirectory,
      clientPath,
      manifest,
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

  return {
    httpServer,
    rootDirectory,
    projectId,
    manifest,
    start: () => {
      if (started) return Promise.resolve(readAddress(httpServer, host));
      if (startPromise) return startPromise;
      startPromise = new Promise<StandaloneServerAddress>((resolveStart, rejectStart) => {
        const onError = (error: Error) => {
          httpServer.off("listening", onListening);
          startPromise = null;
          rejectStart(error);
        };
        const onListening = () => {
          httpServer.off("error", onError);
          started = true;
          resolveStart(readAddress(httpServer, host));
        };
        httpServer.once("error", onError);
        httpServer.once("listening", onListening);
        httpServer.listen(port, host);
      });
      return startPromise;
    },
    close: () => {
      if (!started) return Promise.resolve();
      return new Promise<void>((resolveClose, rejectClose) => {
        httpServer.close((error) => {
          if (error) rejectClose(error);
          else {
            started = false;
            startPromise = null;
            resolveClose();
          }
        });
      });
    },
  };
}

/**
 * Resolves one URL pathname to a canonical file under the project root.
 *
 * URL decoding occurs before path normalization, which makes encoded dot
 * segments subject to the same confinement check as ordinary traversal. The
 * canonical existing ancestor check also rejects a symlink that escapes the
 * root when the requested leaf does not yet exist.
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
  const projectPath = decodedPath.replace(/^\/+/, "") || "index.html";
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
export function isReservedDesignToolRoute(pathname: string): boolean {
  return pathname === DESIGN_TOOL_ROUTE_PREFIX.slice(0, -1)
    || pathname.startsWith(DESIGN_TOOL_ROUTE_PREFIX);
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
  clientPath: string;
  manifest: StandaloneRuntimeManifest;
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

  if (isReservedDesignToolRoute(decodedPath)) {
    await handleDesignToolRoute(input, decodedPath);
    return;
  }

  const resolution = resolveStaticFile(input.rootDirectory, decodedPath);
  if (!resolution) {
    sendText(response, 404, "Not Found");
    return;
  }

  let body = await readFile(resolution.absolutePath);
  if (HTML_EXTENSIONS.has(extname(resolution.projectPath).toLowerCase())) {
    const source = body.toString("utf8");
    const identified = instrumentHtml(source, resolution.projectPath);
    const bootstrapped = injectStandaloneBootstrap(identified.html);
    body = Buffer.from(bootstrapped.html, "utf8");
  }
  sendBody(response, 200, body, contentTypeForPath(resolution.projectPath));
}

async function handleDesignToolRoute(
  input: {
    request: IncomingMessage;
    response: ServerResponse;
    clientPath: string;
    manifest: StandaloneRuntimeManifest;
  },
  pathname: string,
): Promise<void> {
  if (pathname === DESIGN_TOOL_MANIFEST_PATH) {
    const body = Buffer.from(JSON.stringify(input.manifest), "utf8");
    sendBody(input.response, 200, body, "application/json; charset=utf-8", {
      "Cache-Control": "no-store",
    });
    return;
  }
  if (pathname === DESIGN_TOOL_CLIENT_PATH) {
    try {
      const body = await readFile(input.clientPath);
      sendBody(input.response, 200, body, "text/javascript; charset=utf-8", {
        "Cache-Control": "no-cache",
      });
    } catch {
      sendText(input.response, 503, "Design Tool client has not been built.");
    }
    return;
  }
  sendText(input.response, 404, "Not Found");
}

function resolveDefaultClientPath(): string {
  const candidates = DEFAULT_CLIENT_FILE_NAMES.map((fileName) =>
    fileURLToPath(new URL(`./${fileName}`, import.meta.url)));
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
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
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};
