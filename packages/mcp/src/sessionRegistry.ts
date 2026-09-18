import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { readSessionHealth, type SessionHealth } from "./projectSessionClient.ts";
import type { StoredProjectSession } from "./project.ts";

const PROBE_TIMEOUT_MS = 750;
const MAX_DESCRIPTOR_BYTES = 32 * 1024;

export interface LiveProjectSession {
  readonly descriptor: StoredProjectSession;
  readonly health: SessionHealth;
}

/** Reads private registry records and keeps only bridges that answer authenticated probes. */
export async function readLiveProjectSessions(registryRoot: string): Promise<LiveProjectSession[]> {
  const names = await readRegistryDirectory(registryRoot);
  const descriptors = await Promise.all(
    names.filter((name) => name.endsWith(".json")).map((name) => readDescriptor(resolve(registryRoot, name))),
  );
  const live = await Promise.all(descriptors.filter(isPresent).map(probeSession));
  return live.filter(isPresent);
}

async function readRegistryDirectory(registryRoot: string): Promise<string[]> {
  try {
    return await readdir(registryRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readDescriptor(path: string): Promise<StoredProjectSession | undefined> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_DESCRIPTOR_BYTES) return undefined;
    if (typeof process.getuid === "function" && metadata.uid !== process.getuid()) return undefined;
    if ((metadata.mode & 0o077) !== 0) return undefined;

    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isStoredSession(parsed)) return undefined;
    const [workspaceRoot, appRoot] = await Promise.all([realpath(parsed.workspaceRoot), realpath(parsed.appRoot)]);
    return { ...parsed, workspaceRoot, appRoot };
  } catch {
    // Records can disappear during shutdown or refer to a removed worktree.
    return undefined;
  }
}

async function probeSession(descriptor: StoredProjectSession): Promise<LiveProjectSession | undefined> {
  try {
    const health = await readSessionHealth(descriptor, PROBE_TIMEOUT_MS);
    if (health.projectId !== descriptor.projectId || health.available !== true) return undefined;
    return { descriptor, health };
  } catch {
    // A stale or unreachable bridge is not a selectable session.
    return undefined;
  }
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function isLoopbackEndpoint(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:"
      && (url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "::1" || url.hostname === "localhost")
      && url.pathname === "/" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function isStoredSession(value: unknown): value is StoredProjectSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Record<string, unknown>;
  return session.schemaVersion === 1
    && session.protocolVersion === 1
    && typeof session.sessionId === "string" && session.sessionId.length > 0
    && typeof session.projectId === "string" && session.projectId.length > 0
    && typeof session.workspaceRoot === "string" && session.workspaceRoot.length > 0
    && typeof session.appRoot === "string" && session.appRoot.length > 0
    && (session.gitCommonDir === undefined || typeof session.gitCommonDir === "string")
    && (session.branch === undefined || typeof session.branch === "string")
    && typeof session.origin === "string"
    && isLoopbackEndpoint(session.endpoint)
    && typeof session.startedAt === "string"
    && typeof session.pid === "number" && Number.isSafeInteger(session.pid)
    && typeof session.controlToken === "string" && session.controlToken.length >= 32 && session.controlToken.length <= 256;
}

