import { randomUUID } from "node:crypto";
import {
  decodeAgentStatusSnapshot,
  isAgentDeliveredPrompt,
  isCanvasCommandResult,
} from "@nudge-ui/agent-protocol";
import type {
  AgentActivity,
  AgentDeliveredPrompt,
  AgentStatusSnapshot,
  AgentStatusUpdate,
  CanvasCommand,
  CanvasCommandResult,
} from "@nudge-ui/agent-protocol";
import type { CanvasCommandInput } from "./bridgeSession.ts";
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

/** Returns the decoded response body, or null when its shape is invalid. */
type ResponseDecoder<T> = (body: unknown) => T | null;

const ignoreBody: ResponseDecoder<void> = () => undefined;

function decodeSessionHealth(body: unknown): SessionHealth | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const health = body as Record<string, unknown>;
  const status = decodeAgentStatusSnapshot(health.status);
  if (typeof health.projectId !== "string" || health.available !== true
    || typeof health.claimed !== "boolean" || !status) return null;
  return { projectId: health.projectId, available: true, claimed: health.claimed, status };
}

function guarded<T>(guard: (body: unknown) => body is T): ResponseDecoder<T> {
  return (body) => guard(body) ? body : null;
}

async function requestJson<T>(
  session: StoredProjectSession,
  path: string,
  decode: ResponseDecoder<T>,
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
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = (body as { error?: { message?: unknown } } | undefined)?.error;
    throw new ProjectSessionResponseError(
      response.status,
      typeof error?.message === "string" ? error.message : `Nudge project bridge returned ${response.status}.`,
    );
  }
  const decoded = decode(body);
  if (decoded === null) {
    throw new ProjectSessionResponseError(response.status, `Nudge project bridge returned an invalid ${path} response.`);
  }
  return decoded;
}

export async function readSessionHealth(
  session: StoredProjectSession,
  timeoutMs = CONTROL_TIMEOUT_MS,
): Promise<SessionHealth> {
  return await requestJson(session, AGENT_CONTROL_ENDPOINTS.health, decodeSessionHealth, {}, { timeoutMs });
}

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

  private async send<T>(path: string, decode: ResponseDecoder<T>, payload = {}, options?: RequestOptions): Promise<T> {
    return await requestJson(this.descriptor, path, decode, {
      method: "POST",
      body: JSON.stringify({ agentId: this.agentId, ...payload }),
    }, options);
  }

  private async acquireClaim(): Promise<void> {
    await this.send(AGENT_CONTROL_ENDPOINTS.claim, ignoreBody);
    this.claimed = true;
    this.heartbeat = setInterval(() => {
      void this.send(AGENT_CONTROL_ENDPOINTS.heartbeat, ignoreBody).catch(() => undefined);
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

  async waitForPrompt(signal?: AbortSignal, agentClientName?: string): Promise<AgentDeliveredPrompt> {
    await this.claim();
    return await this.send(
      AGENT_CONTROL_ENDPOINTS.listen,
      guarded(isAgentDeliveredPrompt),
      { agentClientName },
      { signal, timeoutMs: null },
    );
  }

  async getRequest(requestId: string): Promise<AgentDeliveredPrompt> {
    await this.claim();
    return await this.send(AGENT_CONTROL_ENDPOINTS.request, guarded(isAgentDeliveredPrompt), { requestId });
  }

  async getStatus(): Promise<AgentStatusSnapshot> {
    const health = await readSessionHealth(this.descriptor);
    return health.status;
  }

  async reportActivity(activity: AgentActivity): Promise<void> {
    await this.claim();
    await this.send(AGENT_CONTROL_ENDPOINTS.activity, ignoreBody, { activity });
  }

  async updateRequestStatus(update: AgentStatusUpdate): Promise<AgentStatusSnapshot> {
    await this.claim();
    return await this.send(AGENT_CONTROL_ENDPOINTS.reportStatus, decodeAgentStatusSnapshot, { update });
  }

  async dispatchCanvasCommand(input: CanvasCommandInput): Promise<CanvasCommandResult> {
    await this.claim();
    const command = { ...input, commandId: input.commandId ?? randomUUID() };
    return await this.send(
      AGENT_CONTROL_ENDPOINTS.canvas,
      guarded(isCanvasCommandResult),
      { command },
      { timeoutMs: CANVAS_TIMEOUT_MS },
    );
  }

  async close(): Promise<void> {
    this.closing = true;
    await this.claimPromise?.catch(() => undefined);
    if (!this.claimed) return;
    this.claimed = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    await this.send(AGENT_CONTROL_ENDPOINTS.release, ignoreBody).catch(() => undefined);
  }
}
