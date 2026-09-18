import { randomUUID } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  AgentPromptRequest,
  AgentStatusSnapshot,
  AgentStatusUpdate,
  CanvasCommand,
  CanvasCommandResult,
} from "@nudge-ui/agent-protocol";
import type { CanvasCommandInput } from "./bridge.ts";
import { AGENT_CONTROL_ENDPOINTS } from "./protocol.ts";
import {
  defaultSessionRegistryRoot,
  resolveWorkspaceRoot,
  type ProjectSession,
  type StoredProjectSession,
} from "./project.ts";

const PROBE_TIMEOUT_MS = 750;
const CONTROL_TIMEOUT_MS = 5_000;
const CANVAS_TIMEOUT_MS = 65_000;
const MAX_DESCRIPTOR_BYTES = 32 * 1024;

export interface DiscoveredProjectSession extends ProjectSession {
  readonly matchesWorkspace: boolean;
  readonly matchesApplication: boolean;
  readonly claimed: boolean;
  readonly status: Pick<AgentStatusSnapshot, "connection" | "listenerActive" | "paired">;
}

interface ControlHealth {
  readonly projectId: string;
  readonly available: true;
  readonly claimed: boolean;
  readonly status: AgentStatusSnapshot;
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

function publicSession(session: StoredProjectSession): ProjectSession {
  const { controlToken: _controlToken, pid: _pid, ...visible } = session;
  return visible;
}

async function requestJson<T>(
  session: StoredProjectSession,
  path: string,
  init: RequestInit = {},
  longLived = false,
  timeoutMs = CONTROL_TIMEOUT_MS,
): Promise<T> {
  const response = await fetch(`${session.endpoint}${path}`, {
    ...init,
    redirect: "error",
    signal: init.signal ?? (longLived ? undefined : AbortSignal.timeout(timeoutMs)),
    headers: {
      Authorization: `Bearer ${session.controlToken}`,
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined;
  if (!response.ok) throw new Error(body?.error?.message ?? `Nudge project bridge returned ${response.status}.`);
  return body as T;
}

async function readDescriptors(registryRoot: string): Promise<StoredProjectSession[]> {
  let names: string[];
  try {
    names = await readdir(registryRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const descriptors = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => {
    try {
      const path = resolve(registryRoot, name);
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_DESCRIPTOR_BYTES) return undefined;
      if (typeof process.getuid === "function" && metadata.uid !== process.getuid()) return undefined;
      if ((metadata.mode & 0o077) !== 0) return undefined;
      const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
      if (!isStoredSession(parsed)) return undefined;
      const workspaceRoot = await realpath(parsed.workspaceRoot);
      const appRoot = await realpath(parsed.appRoot);
      return { ...parsed, workspaceRoot, appRoot };
    } catch {
      return undefined;
    }
  }));
  return descriptors.filter((session): session is StoredProjectSession => session !== undefined);
}

async function liveDescriptors(registryRoot: string): Promise<Array<{ descriptor: StoredProjectSession; health: ControlHealth }>> {
  const descriptors = await readDescriptors(registryRoot);
  const results = await Promise.all(descriptors.map(async (descriptor) => {
    try {
      const health = await requestJson<ControlHealth>(descriptor, AGENT_CONTROL_ENDPOINTS.health, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (health.projectId !== descriptor.projectId || health.available !== true) return undefined;
      return { descriptor, health };
    } catch {
      return undefined;
    }
  }));
  return results.filter((result): result is { descriptor: StoredProjectSession; health: ControlHealth } => result !== undefined);
}

export async function discoverProjectSessions(
  applicationRoot: string,
  registryRoot = defaultSessionRegistryRoot(),
): Promise<DiscoveredProjectSession[]> {
  const canonicalApplication = await realpath(resolve(applicationRoot));
  const canonicalWorkspace = await resolveWorkspaceRoot(canonicalApplication);
  const live = await liveDescriptors(resolve(registryRoot));
  return live.map(({ descriptor, health }) => {
    const matchesWorkspace = descriptor.workspaceRoot === canonicalWorkspace;
    return {
      ...publicSession(descriptor),
      matchesWorkspace,
      matchesApplication: matchesWorkspace
        && (canonicalApplication === canonicalWorkspace || descriptor.appRoot === canonicalApplication),
      claimed: health.claimed,
      status: {
        connection: health.status.connection,
        listenerActive: health.status.listenerActive,
        paired: health.status.paired,
      },
    };
  }).sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

class ProjectSessionClient {
  readonly descriptor: StoredProjectSession;
  readonly agentId: string;
  private claimed = false;
  private claimPromise: Promise<void> | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private closing = false;

  constructor(descriptor: StoredProjectSession, agentId: string) {
    this.descriptor = descriptor;
    this.agentId = agentId;
  }

  async claim(): Promise<void> {
    if (this.closing) throw new Error("The MCP adapter is closing.");
    if (this.claimed) return;
    if (this.claimPromise) return await this.claimPromise;
    this.claimPromise = (async () => {
      await requestJson(this.descriptor, AGENT_CONTROL_ENDPOINTS.claim, {
        method: "POST",
        body: JSON.stringify({ agentId: this.agentId }),
      });
      this.claimed = true;
      this.heartbeat = setInterval(() => {
        void requestJson(this.descriptor, AGENT_CONTROL_ENDPOINTS.heartbeat, {
          method: "POST",
          body: JSON.stringify({ agentId: this.agentId }),
        }).catch(() => undefined);
      }, 10_000);
      this.heartbeat.unref();
    })();
    try {
      await this.claimPromise;
    } finally {
      this.claimPromise = null;
    }
  }

  async waitForPrompt(signal?: AbortSignal): Promise<AgentPromptRequest> {
    await this.claim();
    return await requestJson<AgentPromptRequest>(this.descriptor, AGENT_CONTROL_ENDPOINTS.listen, {
      method: "POST",
      body: JSON.stringify({ agentId: this.agentId }),
      signal,
    }, true);
  }

  async getStatus(): Promise<AgentStatusSnapshot> {
    const health = await requestJson<ControlHealth>(this.descriptor, AGENT_CONTROL_ENDPOINTS.health);
    return health.status;
  }

  async updateRequestStatus(update: AgentStatusUpdate): Promise<AgentStatusSnapshot> {
    await this.claim();
    return await requestJson<AgentStatusSnapshot>(this.descriptor, AGENT_CONTROL_ENDPOINTS.reportStatus, {
      method: "POST",
      body: JSON.stringify({ agentId: this.agentId, update }),
    });
  }

  async dispatchCanvasCommand(input: CanvasCommandInput): Promise<CanvasCommandResult> {
    await this.claim();
    const command = { ...input, commandId: input.commandId ?? randomUUID() } as CanvasCommand;
    return await requestJson<CanvasCommandResult>(this.descriptor, AGENT_CONTROL_ENDPOINTS.canvas, {
      method: "POST",
      body: JSON.stringify({ agentId: this.agentId, command }),
    }, false, CANVAS_TIMEOUT_MS);
  }

  async close(): Promise<void> {
    this.closing = true;
    await this.claimPromise?.catch(() => undefined);
    if (!this.claimed) return;
    this.claimed = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    await requestJson(this.descriptor, AGENT_CONTROL_ENDPOINTS.release, {
      method: "POST",
      body: JSON.stringify({ agentId: this.agentId }),
    }).catch(() => undefined);
  }
}

/** Routes MCP tools to a live project in the adapter's exact worktree. */
export class DiscoveredProjectRouter {
  readonly workspaceRoot: string;
  readonly applicationRoot: string;
  readonly registryRoot: string;
  readonly agentId: string;
  private client: ProjectSessionClient | null = null;
  private selectedAppRoot: string | null = null;
  private releaseGeneration = 0;

  private constructor(workspaceRoot: string, applicationRoot: string, registryRoot: string, agentId: string) {
    this.workspaceRoot = workspaceRoot;
    this.applicationRoot = applicationRoot;
    this.registryRoot = registryRoot;
    this.agentId = agentId;
  }

  static async create(workspaceRoot: string, registryRoot = defaultSessionRegistryRoot()): Promise<DiscoveredProjectRouter> {
    const applicationRoot = await realpath(resolve(workspaceRoot));
    return new DiscoveredProjectRouter(
      await resolveWorkspaceRoot(applicationRoot),
      applicationRoot,
      resolve(registryRoot),
      randomUUID(),
    );
  }

  async listSessions(): Promise<DiscoveredProjectSession[]> {
    return await discoverProjectSessions(this.applicationRoot, this.registryRoot);
  }

  private async select(sessionId?: string): Promise<ProjectSessionClient> {
    const live = await liveDescriptors(this.registryRoot);
    const workspaceSessions = live.filter(({ descriptor }) => descriptor.workspaceRoot === this.workspaceRoot);
    const hasApplicationAffinity = this.applicationRoot !== this.workspaceRoot;
    const candidates = hasApplicationAffinity
      ? workspaceSessions.filter(({ descriptor }) => descriptor.appRoot === this.applicationRoot)
      : workspaceSessions;
    let selected: StoredProjectSession | undefined;
    if (sessionId) {
      selected = candidates.find(({ descriptor }) => descriptor.sessionId === sessionId)?.descriptor;
      if (!selected) {
        throw new Error(hasApplicationAffinity
          ? "The selected Nudge session is not live for this exact application."
          : "The selected Nudge session is not live in this exact workspace.");
      }
    } else if (this.client) {
      selected = candidates.find(({ descriptor }) => descriptor.sessionId === this.client?.descriptor.sessionId)?.descriptor;
      if (!selected) {
        const replacements = candidates.filter(({ descriptor }) => descriptor.appRoot === this.selectedAppRoot);
        if (replacements.length === 1) selected = replacements[0]?.descriptor;
        else if (replacements.length > 1) throw new Error("Several restarted Nudge sessions match the selected app. Pass sessionId explicitly.");
      }
    } else if (candidates.length === 1) {
      selected = candidates[0]?.descriptor;
    } else if (workspaceSessions.length === 0) {
      throw new Error("No live Nudge project session matches this exact workspace. Start the project development server first.");
    } else if (candidates.length === 0 && hasApplicationAffinity) {
      throw new Error("No live Nudge project session matches this exact application. Start its development server first.");
    } else {
      throw new Error("Several Nudge apps are running in this workspace. Call nudge_list_sessions, then pass sessionId to nudge_listen.");
    }
    if (!selected) throw new Error("The previously selected Nudge app is no longer running.");
    if (this.client?.descriptor.sessionId === selected.sessionId) return this.client;
    await this.client?.close();
    this.client = new ProjectSessionClient(selected, this.agentId);
    this.selectedAppRoot = selected.appRoot;
    return this.client;
  }

  async waitForPrompt(signal?: AbortSignal, sessionId?: string): Promise<AgentPromptRequest> {
    const releaseGeneration = this.releaseGeneration;
    const client = await this.select(sessionId);
    if (releaseGeneration !== this.releaseGeneration) {
      if (this.client === client) {
        this.client = null;
        await client.close();
      }
      throw new Error("The Nudge project session was released.");
    }
    try {
      return await client.waitForPrompt(signal);
    } catch (error) {
      if (signal?.aborted || sessionId || releaseGeneration !== this.releaseGeneration) throw error;
      const replacement = await this.select();
      if (replacement === client) throw error;
      return await replacement.waitForPrompt(signal);
    }
  }

  async getStatus(): Promise<AgentStatusSnapshot> { return await (await this.select()).getStatus(); }
  async updateRequestStatus(update: AgentStatusUpdate): Promise<AgentStatusSnapshot> {
    return await (await this.select()).updateRequestStatus(update);
  }
  async dispatchCanvasCommand(command: CanvasCommandInput): Promise<CanvasCommandResult> {
    return await (await this.select()).dispatchCanvasCommand(command);
  }
  async release(): Promise<void> {
    this.releaseGeneration += 1;
    const client = this.client;
    this.client = null;
    await client?.close();
  }
  async close(): Promise<void> { await this.release(); }
}
