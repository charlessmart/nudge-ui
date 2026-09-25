import { randomUUID } from "node:crypto";
import type {
  AgentPromptRequest,
  AgentStatusSnapshot,
  AgentStatusUpdate,
  CanvasCommand,
  CanvasCommandResult,
} from "@nudge-ui/agent-protocol";
import type { CanvasCommandInput } from "./bridge.ts";
import type { StoredProjectSession } from "./project.ts";
import { AGENT_CONTROL_ENDPOINTS } from "./protocol.ts";

const CONTROL_TIMEOUT_MS = 5_000;
const CANVAS_TIMEOUT_MS = 65_000;

export interface SessionHealth {
  readonly projectId: string;
  readonly available: true;
  readonly claimed: boolean;
  readonly status: AgentStatusSnapshot;
}

/** Represents an HTTP response from a project bridge that could be classified. */
export class ProjectSessionResponseError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ProjectSessionResponseError";
    this.status = status;
  }
}

interface RequestOptions {
  readonly signal?: AbortSignal;
  /** Null allows a listener to wait until a prompt arrives or its signal aborts. */
  readonly timeoutMs?: number | null;
}

async function requestJson<T>(
  session: StoredProjectSession,
  path: string,
  init: RequestInit = {},
  { signal, timeoutMs = CONTROL_TIMEOUT_MS }: RequestOptions = {},
): Promise<T> {
  const response = await fetch(`${session.endpoint}${path}`, {
    ...init,
    redirect: "error",
    signal: signal ?? (timeoutMs === null ? undefined : AbortSignal.timeout(timeoutMs)),
    headers: {
      Authorization: `Bearer ${session.controlToken}`,
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined;
  if (!response.ok) {
    throw new ProjectSessionResponseError(
      response.status,
      body?.error?.message ?? `Nudge project bridge returned ${response.status}.`,
    );
  }
  return body as T;
}

export async function readSessionHealth(
  session: StoredProjectSession,
  timeoutMs = CONTROL_TIMEOUT_MS,
): Promise<SessionHealth> {
  return await requestJson(session, AGENT_CONTROL_ENDPOINTS.health, {}, { timeoutMs });
}

/** Owns one project's claim, heartbeat, and authenticated control requests. */
export class ProjectSessionClient {
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

  private async send<T>(path: string, payload = {}, options?: RequestOptions): Promise<T> {
    return await requestJson<T>(this.descriptor, path, {
      method: "POST",
      body: JSON.stringify({ agentId: this.agentId, ...payload }),
    }, options);
  }

  private async acquireClaim(): Promise<void> {
    await this.send(AGENT_CONTROL_ENDPOINTS.claim);
    this.claimed = true;
    this.heartbeat = setInterval(() => {
      void this.send(AGENT_CONTROL_ENDPOINTS.heartbeat).catch(() => undefined);
    }, 10_000);
    this.heartbeat.unref();
  }

  private async claim(): Promise<void> {
    if (this.closing) throw new Error("The MCP adapter is closing.");
    if (this.claimed) return;
    if (this.claimPromise) return await this.claimPromise;
    this.claimPromise = this.acquireClaim();
    try {
      await this.claimPromise;
    } finally {
      this.claimPromise = null;
    }
  }

  async waitForPrompt(signal?: AbortSignal): Promise<AgentPromptRequest> {
    await this.claim();
    return await this.send(AGENT_CONTROL_ENDPOINTS.listen, {}, { signal, timeoutMs: null });
  }

  async getStatus(): Promise<AgentStatusSnapshot> {
    const health = await readSessionHealth(this.descriptor);
    return health.status;
  }

  async updateRequestStatus(update: AgentStatusUpdate): Promise<AgentStatusSnapshot> {
    await this.claim();
    return await this.send(AGENT_CONTROL_ENDPOINTS.reportStatus, { update });
  }

  async dispatchCanvasCommand(input: CanvasCommandInput): Promise<CanvasCommandResult> {
    await this.claim();
    const command = { ...input, commandId: input.commandId ?? randomUUID() } as CanvasCommand;
    return await this.send(AGENT_CONTROL_ENDPOINTS.canvas, { command }, { timeoutMs: CANVAS_TIMEOUT_MS });
  }

  async close(): Promise<void> {
    this.closing = true;
    await this.claimPromise?.catch(() => undefined);
    if (!this.claimed) return;
    this.claimed = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    await this.send(AGENT_CONTROL_ENDPOINTS.release).catch(() => undefined);
  }
}
