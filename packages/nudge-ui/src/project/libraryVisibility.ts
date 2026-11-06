import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import {
  EMPTY_LIBRARY_VISIBILITY,
  parseLibraryVisibility,
  type LibraryVisibilityFile,
} from "../transport/library.ts";
import { NUDGE_UI_LIBRARY_PATH } from "../transport/routes.ts";
import { isSameOriginRequest } from "./sameOrigin.ts";

const MAX_BYTES = 1024 * 1024;

async function libraryFile(root: string, create: boolean): Promise<string> {
  const project = await realpath(root);
  const directory = join(project, ".nudge");
  if (create) await mkdir(directory, { recursive: true });
  // The directory may be a symlink; the file must still land inside the project.
  const actual = await realpath(directory).catch(() => directory);
  const pathFromRoot = relative(project, actual);
  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new Error("Library settings must remain inside the project root");
  }
  return join(actual, "library.json");
}

export async function readLibraryVisibility(root: string): Promise<LibraryVisibilityFile> {
  try {
    const parsed = parseLibraryVisibility(JSON.parse(await readFile(await libraryFile(root, false), "utf8")));
    return parsed ?? EMPTY_LIBRARY_VISIBILITY;
  } catch {
    return EMPTY_LIBRARY_VISIBILITY;
  }
}

async function writeLibraryVisibility(root: string, value: LibraryVisibilityFile): Promise<void> {
  const file = await libraryFile(root, true);
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += data.byteLength;
    if (size > MAX_BYTES) throw new RangeError("Library settings are too large");
    chunks.push(data);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function respond(response: ServerResponse, status: number, content: string, type = "text/plain; charset=utf-8"): void {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(content);
}

/** Handles only the reserved library route. A false return lets the host continue. */
export async function handleLibraryVisibilityRequest(
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
): Promise<boolean> {
  const pathname = new URL(request.url ?? "/", "http://nudge-ui.local").pathname;
  if (pathname !== NUDGE_UI_LIBRARY_PATH) return false;
  if (request.method !== "GET" && request.method !== "PUT") {
    respond(response, 405, "Method Not Allowed");
    return true;
  }
  if (request.method === "PUT" && !isSameOriginRequest(request)) {
    respond(response, 403, "Cross-origin library writes are not allowed");
    return true;
  }
  try {
    if (request.method === "GET") {
      respond(response, 200, JSON.stringify(await readLibraryVisibility(root)), "application/json; charset=utf-8");
      return true;
    }
    const parsed = parseLibraryVisibility(await body(request));
    if (!parsed) {
      respond(response, 400, "Invalid library settings");
      return true;
    }
    await writeLibraryVisibility(root, parsed);
    respond(response, 200, JSON.stringify(parsed), "application/json; charset=utf-8");
  } catch (error) {
    respond(response, error instanceof RangeError ? 413 : 400, error instanceof Error ? error.message : "Library settings failed");
  }
  return true;
}
