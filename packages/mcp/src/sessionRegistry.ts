import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { AGENT_PROTOCOL_VERSION, type AgentStatusSnapshot } from "@nudge-ui/agent-protocol";
import { ProjectSessionResponseError, readSessionHealth, type SessionHealth } from "./projectSessionClient.ts";
import type { StoredProjectSession } from "./project.ts";

const PROBE_TIMEOUT_MS = 750;
const MAX_DESCRIPTOR_BYTES = 32 * 1024;

export interface LiveProjectSession {
  readonly descriptor: StoredProjectSession;
  readonly health: SessionHealth;
}

export interface SessionInspection {
  readonly descriptorCount: number;
  readonly invalidCount: number;
  readonly incompatibleCount: number;
  readonly unreachable: readonly Pick<StoredProjectSession, "workspaceRoot" | "appRoot" | "sessionId">[];
  readonly live: LiveProjectSession[];
}

/** Separates absent, invalid, incompatible, and unreachable registrations. */
export async function inspectProjectSessions(registryRoot: string): Promise<SessionInspection> {
  const names = (await readRegistryDirectory(registryRoot)).filter((name) => name.endsWith(".json"));
  const records = await Promise.all(names.map((name) => readDescriptor(resolve(registryRoot, name))));
  const descriptors = records.filter((record): record is StoredProjectSession => typeof record === "object");
  const probes = await Promise.all(descriptors.map(probeSession));
  return {
    descriptorCount: names.length,
    invalidCount: records.filter((record) => record === undefined).length
      + probes.filter((probe) => probe.kind === "invalid").length,
    incompatibleCount: records.filter((record) => record === "incompatible").length,
    unreachable: descriptors.filter((_, index) => probes[index]?.kind === "unreachable")
      .map(({ workspaceRoot, appRoot, sessionId }) => ({ workspaceRoot, appRoot, sessionId })),
    live: probes.flatMap((probe) => probe.kind === "live" ? [probe.session] : []),
  };
}

/** Keeps only compatible bridges that answer authenticated probes. */
export async function readLiveProjectSessions(registryRoot: string): Promise<LiveProjectSession[]> {
  return (await inspectProjectSessions(registryRoot)).live;
}

async function readRegistryDirectory(registryRoot: string): Promise<string[]> {
  try {
    return await readdir(registryRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readDescriptor(path: string): Promise<StoredProjectSession | "incompatible" | undefined> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_DESCRIPTOR_BYTES) return undefined;
    if (typeof process.getuid === "function" && metadata.uid !== process.getuid()) return undefined;
    if ((metadata.mode & 0o077) !== 0) return undefined;

    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isStoredSession(parsed)) return undefined;
    if (parsed.protocolVersion !== AGENT_PROTOCOL_VERSION) return "incompatible";
    const [workspaceRoot, appRoot] = await Promise.all([realpath(parsed.workspaceRoot), realpath(parsed.appRoot)]);
    return { ...parsed, protocolVersion: AGENT_PROTOCOL_VERSION, workspaceRoot, appRoot };
  } catch {
    // Records can disappear during shutdown or refer to a removed worktree.
    return undefined;
  }
}

type SessionProbe =
  | { readonly kind: "live"; readonly session: LiveProjectSession }
  | { readonly kind: "invalid" }
  | { readonly kind: "unreachable" };

async function probeSession(descriptor: StoredProjectSession): Promise<SessionProbe> {
  try {
    const health: unknown = await readSessionHealth(descriptor, PROBE_TIMEOUT_MS);
    if (!isSessionHealth(health) || health.projectId !== descriptor.projectId) return { kind: "invalid" };
    return { kind: "live", session: { descriptor, health } };
  } catch (error) {
    // An HTTP response proves that the endpoint exists. Network and timeout errors are unreachable.
    return { kind: error instanceof ProjectSessionResponseError ? "invalid" : "unreachable" };
  }
}

function isSessionHealth(value: unknown): value is SessionHealth {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const health = value as Record<string, unknown>;
  return typeof health.projectId === "string"
    && health.available === true
    && typeof health.claimed === "boolean"
    && isAgentStatusSnapshot(health.status);
}

function isAgentStatusSnapshot(value: unknown): value is AgentStatusSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const status = value as Record<string, unknown>;
  return status.protocolVersion === AGENT_PROTOCOL_VERSION
    && typeof status.projectId === "string"
    && (status.connection === "offline" || status.connection === "listening" || status.connection === "paired" || status.connection === "working")
    && typeof status.listenerActive === "boolean"
    && typeof status.paired === "boolean"
    && (status.request === null || (typeof status.request === "object" && !Array.isArray(status.request)));
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

type RegisteredSession = Omit<StoredProjectSession, "protocolVersion"> & { readonly protocolVersion: number };

function isStoredSession(value: unknown): value is RegisteredSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Record<string, unknown>;
  return session.schemaVersion === 1
    && typeof session.protocolVersion === "number" && Number.isSafeInteger(session.protocolVersion)
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
