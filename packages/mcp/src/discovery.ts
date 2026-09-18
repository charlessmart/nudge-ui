import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  AgentPromptRequest,
  AgentStatusSnapshot,
  AgentStatusUpdate,
  CanvasCommandResult,
} from "@nudge-ui/agent-protocol";
import type { CanvasCommandInput } from "./bridge.ts";
import { ProjectSessionClient } from "./projectSessionClient.ts";
import { readLiveProjectSessions } from "./sessionRegistry.ts";
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
  applicationRoot: string,
  registryRoot = defaultSessionRegistryRoot(),
): Promise<DiscoveredProjectSession[]> {
  const canonicalApplication = await realpath(resolve(applicationRoot));
  const canonicalWorkspace = await resolveWorkspaceRoot(canonicalApplication);
  const live = await readLiveProjectSessions(resolve(registryRoot));
  return live.map(({ descriptor, health }) => {
    const matchesWorkspace = descriptor.workspaceRoot === canonicalWorkspace;
    return {
      ...publicSession(descriptor),
      matchesWorkspace,
      matchesApplication: matchesApplication(descriptor, {
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

  private async connectToSession(sessionId?: string): Promise<ProjectSessionClient> {
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
    const client = this.client;
    this.client = null;
    await client?.close();
  }

  async close(): Promise<void> {
    await this.release();
  }
}
