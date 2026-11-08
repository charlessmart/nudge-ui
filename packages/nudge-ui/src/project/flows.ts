import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import {
  NUDGE_FLOWS_DIRECTORY,
  NUDGE_FLOWS_STATUS_FILE,
  parseFlowDefinition,
  parseFlowStateStatus,
  pruneFlowStatus,
  type FlowDefinition,
  type FlowsResponse,
  type FlowStateStatus,
} from "../transport/flows.ts";
import { NUDGE_UI_FLOWS_PATH } from "../transport/routes.ts";
import { isSameOriginRequest } from "./sameOrigin.ts";

const MAX_FLOW_BYTES = 4 * 1024 * 1024;
const MAX_STATUS_BYTES = 256 * 1024;

const statusOperations = new Map<string, Promise<unknown>>();

async function insideProject(root: string, path: string, create: boolean): Promise<string> {
  const project = await realpath(root);
  const target = join(project, path);
  if (create) await mkdir(target, { recursive: true });
  // The directory may be a symlink; what is read and written must still be inside the project.
  const actual = await realpath(target).catch(() => target);
  const pathFromRoot = relative(project, actual);
  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new Error("Flow files must remain inside the project root");
  }
  return actual;
}

async function statusFile(root: string, create: boolean): Promise<string> {
  const [directory, name] = NUDGE_FLOWS_STATUS_FILE.split("/") as [string, string];
  return join(await insideProject(root, directory, create), name);
}

async function readStatus(root: string): Promise<FlowStateStatus[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(await statusFile(root, false), "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseFlowStateStatus).filter((item): item is FlowStateStatus => item !== null);
  } catch {
    return [];
  }
}

/** Every usable flow in the project, plus why any other file could not be used. */
export async function readFlows(root: string): Promise<FlowsResponse> {
  const flows: FlowDefinition[] = [];
  const errors: { file: string; message: string }[] = [];
  let names: string[] = [];
  const directory = await insideProject(root, NUDGE_FLOWS_DIRECTORY, false);
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    // No flows directory yet: the project simply has not been mapped.
  }
  const seen = new Set<string>();
  for (const name of names) {
    const file = `${NUDGE_FLOWS_DIRECTORY}/${name}`;
    try {
      const source = await readFile(join(directory, name), "utf8");
      if (source.length > MAX_FLOW_BYTES) throw new Error("file is larger than 4 MB");
      const parsed = parseFlowDefinition(JSON.parse(source));
      if ("error" in parsed) throw new Error(parsed.error);
      if (seen.has(parsed.flow.id)) throw new Error(`another file already uses the id "${parsed.flow.id}"`);
      seen.add(parsed.flow.id);
      flows.push(parsed.flow);
    } catch (error) {
      errors.push({ file, message: error instanceof Error ? error.message : "could not be read" });
    }
  }
  return { flows, errors, status: pruneFlowStatus(await readStatus(root), flows, errors.length > 0) };
}

async function recordStatus(root: string, status: FlowStateStatus): Promise<void> {
  const file = await statusFile(root, true);
  const previous = statusOperations.get(file) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(async () => {
    const { flows, errors } = await readFlows(root);
    const current = pruneFlowStatus(await readStatus(root), flows, errors.length > 0)
      .filter((item) => item.flowId !== status.flowId || item.stateId !== status.stateId);
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify([...current, status], null, 2)}\n`);
    await rename(temporary, file);
  });
  statusOperations.set(file, pending);
  try { await pending; } finally {
    if (statusOperations.get(file) === pending) statusOperations.delete(file);
  }
}

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += data.byteLength;
    if (size > MAX_STATUS_BYTES) throw new RangeError("Flow status is too large");
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

/** Handles only the reserved flows routes. A false return lets the host continue. */
export async function handleFlowsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
): Promise<boolean> {
  const pathname = new URL(request.url ?? "/", "http://nudge-ui.local").pathname;
  const statusRoute = `${NUDGE_UI_FLOWS_PATH}/status`;
  if (pathname !== NUDGE_UI_FLOWS_PATH && pathname !== statusRoute) return false;
  try {
    if (pathname === NUDGE_UI_FLOWS_PATH) {
      if (request.method !== "GET") {
        respond(response, 405, "Method Not Allowed");
        return true;
      }
      respond(response, 200, JSON.stringify(await readFlows(root)), "application/json; charset=utf-8");
      return true;
    }
    if (request.method !== "POST") {
      respond(response, 405, "Method Not Allowed");
      return true;
    }
    if (!isSameOriginRequest(request)) {
      respond(response, 403, "Cross-origin flow writes are not allowed");
      return true;
    }
    const status = parseFlowStateStatus(await body(request));
    if (!status) {
      respond(response, 400, "Invalid flow status");
      return true;
    }
    await recordStatus(root, status);
    respond(response, 204, "");
  } catch (error) {
    respond(response, error instanceof RangeError ? 413 : 400, error instanceof Error ? error.message : "Flow request failed");
  }
  return true;
}
