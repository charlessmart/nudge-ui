import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type {
  AgentPromptRequest,
  AgentStatusSnapshot,
  AgentStatusUpdate,
  CanvasCommandResult,
} from "@nudge-ui/agent-protocol";
import type { CanvasCommandInput } from "./bridge.ts";
import { ProjectSessionClient } from "./projectSessionClient.ts";
import { inspectProjectSessions, readLiveProjectSessions } from "./sessionRegistry.ts";
import { matchesApplication, selectProjectSession } from "./sessionSelection.ts";
import {
  defaultSessionRegistryRoot,
  resolveWorkspaceRoot,
  type ProjectSession,
  type StoredProjectSession,
} from "./project.ts";

export interface DiscoveredProjectSession extends ProjectSession {
  readonly matchesWorkspace: boolean;
  readonly matchesApplication: boolean;
  readonly claimed: boolean;
  readonly status: Pick<AgentStatusSnapshot, "connection" | "listenerActive" | "paired">;
}

function publicSession(session: StoredProjectSession): ProjectSession {
  const { controlToken: _controlToken, pid: _pid, ...visible } = session;
  return visible;
}

export async function discoverProjectSessions(
  applicationRoot: string | undefined,
  registryRoot = defaultSessionRegistryRoot(),
): Promise<DiscoveredProjectSession[]> {
  const canonicalApplication = applicationRoot === undefined
    ? undefined
    : await realpath(requireAbsoluteWorkspaceRoot(applicationRoot));
  const canonicalWorkspace = canonicalApplication === undefined ? undefined : await resolveWorkspaceRoot(canonicalApplication);
  const live = await readLiveProjectSessions(resolve(registryRoot));
  return live.map(({ descriptor, health }) => {
    const matchesWorkspace = descriptor.workspaceRoot === canonicalWorkspace;
    return {
      ...publicSession(descriptor),
      matchesWorkspace,
      matchesApplication: canonicalWorkspace !== undefined && canonicalApplication !== undefined && matchesApplication(descriptor, {
        workspaceRoot: canonicalWorkspace,
        applicationRoot: canonicalApplication,
      }),
      claimed: health.claimed,
      status: {
        connection: health.status.connection,
        listenerActive: health.status.listenerActive,
        paired: health.status.paired,
      },
    };
  }).sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

/** Routes MCP tools to a live project in the adapter's exact worktree. */
export class DiscoveredProjectRouter {
  readonly workspaceRoot: string;
  readonly applicationRoot: string;
  readonly registryRoot: string;
  readonly agentId: string;
  private client: ProjectSessionClient | null = null;
  private releaseGeneration = 0;
  private connectionQueue: Promise<void> = Promise.resolve();

  private constructor(workspaceRoot: string, applicationRoot: string, registryRoot: string, agentId: string) {
    this.workspaceRoot = workspaceRoot;
    this.applicationRoot = applicationRoot;
    this.registryRoot = registryRoot;
    this.agentId = agentId;
  }

  get selectedSessionId(): string | undefined {
    return this.client?.descriptor.sessionId;
  }

  static forSession(session: StoredProjectSession, registryRoot: string): DiscoveredProjectRouter {
    const router = new DiscoveredProjectRouter(session.workspaceRoot, session.appRoot, registryRoot, randomUUID());
    router.client = new ProjectSessionClient(session, router.agentId);
    return router;
  }

  static async create(workspaceRoot: string, registryRoot = defaultSessionRegistryRoot()): Promise<DiscoveredProjectRouter> {
    const applicationRoot = await realpath(requireAbsoluteWorkspaceRoot(workspaceRoot));
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

  private connectToSession(sessionId?: string): Promise<ProjectSessionClient> {
    const connection = this.connectionQueue.then(() => this.selectSession(sessionId));
    this.connectionQueue = connection.then(() => undefined, () => undefined);
    return connection;
  }

  private async selectSession(sessionId?: string): Promise<ProjectSessionClient> {
    const live = await readLiveProjectSessions(this.registryRoot);
    const selected = selectProjectSession(live.map(({ descriptor }) => descriptor), {
      workspaceRoot: this.workspaceRoot,
      applicationRoot: this.applicationRoot,
      requestedSessionId: sessionId,
      previousSession: this.client?.descriptor,
    });
    if (this.client?.descriptor.sessionId === selected.sessionId) return this.client;
    await this.client?.close();
    this.client = new ProjectSessionClient(selected, this.agentId);
    return this.client;
  }

  async waitForPrompt(signal?: AbortSignal, sessionId?: string): Promise<AgentPromptRequest> {
    const releaseGeneration = this.releaseGeneration;
    const client = await this.connectToSession(sessionId);
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
      const replacement = await this.connectToSession();
      if (replacement === client) throw error;
      return await replacement.waitForPrompt(signal);
    }
  }

  async getStatus(): Promise<AgentStatusSnapshot> {
    const client = await this.connectToSession();
    return await client.getStatus();
  }

  async updateRequestStatus(update: AgentStatusUpdate): Promise<AgentStatusSnapshot> {
    const client = await this.connectToSession();
    return await client.updateRequestStatus(update);
  }

  async dispatchCanvasCommand(command: CanvasCommandInput): Promise<CanvasCommandResult> {
    const client = await this.connectToSession();
    return await client.dispatchCanvasCommand(command);
  }

  async release(): Promise<void> {
    this.releaseGeneration += 1;
    await this.connectionQueue;
    const client = this.client;
    this.client = null;
    await client?.close();
  }

  async close(): Promise<void> {
    await this.release();
  }
}

/** Returns diagnostic counts, scope, and public paths without exposing registry credentials. */
export async function diagnoseProjectSessions(applicationRoot?: string, registryRoot = defaultSessionRegistryRoot()) {
  const resolvedRegistryRoot = resolve(registryRoot);
  const app = applicationRoot === undefined
    ? undefined
    : await realpath(requireAbsoluteWorkspaceRoot(applicationRoot));
  const workspace = app === undefined ? undefined : await resolveWorkspaceRoot(app);
  const inspection = await inspectProjectSessions(resolvedRegistryRoot);
  const matching = (session: Pick<ProjectSession, "workspaceRoot" | "appRoot">) =>
    app === undefined || (session.workspaceRoot === workspace && (app === workspace || session.appRoot === app));
  return {
    registryRoot: resolvedRegistryRoot,
    workspaceRoot: workspace,
    applicationRoot: app,
    descriptorCount: inspection.descriptorCount,
    invalidCount: inspection.invalidCount,
    incompatibleCount: inspection.incompatibleCount,
    reachableCount: inspection.live.length,
    matchingReachableCount: inspection.live.filter(({ descriptor }) => matching(descriptor)).length,
    matchingUnreachableCount: inspection.unreachable.filter(matching).length,
    guidance: [
      ...(inspection.invalidCount > 0 ? ["Some session descriptors or authenticated health responses are invalid. Check the adapter and project bridge versions, descriptor permissions, and bridge logs."] : []),
      ...(inspection.unreachable.some(matching) ? ["Matching descriptors exist but their loopback endpoints are unreachable. The server may have stopped or local networking may be blocked. Retry outside the agent command sandbox; do not treat this as proof that no bridge registered."] : []),
      ...(inspection.incompatibleCount > 0 ? ["Some registrations use an incompatible protocol. Upgrade the reusable adapter and the project's @nudge-ui/mcp dependency, then restart the development server and agent host."] : []),
    ],
  };
}

function requireAbsoluteWorkspaceRoot(workspaceRoot: string): string {
  if (!isAbsolute(workspaceRoot)) throw new TypeError("workspaceRoot must be an absolute path.");
  return workspaceRoot;
}
