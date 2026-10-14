import {
  AGENT_PROTOCOL_LIMITS,
  AGENT_PROTOCOL_VERSION,
  canonicalOrigin,
  deriveConnectionState,
  isAgentActivity,
  isAgentStatusUpdate,
  isAllowedOrigin,
  isCanvasCommand,
  isSameOriginRoute,
  validateRoutes,
} from "@nudge-ui/agent-protocol";
import type {
  AgentActivity,
  AgentDeliveredPrompt,
  AgentPromptRequest,
  AgentRequestOutcome,
  AgentSketchAttachment,
  AgentStatusSnapshot,
  AgentStatusUpdate,
  BridgeEnvelope,
  BridgeEvent,
  CanvasCommand,
  CanvasCommandResult,
  FitCanvasCommand,
  FocusCanvasGroupCommand,
  PairingResponse,
  PresentRoutesCommand,
  PromptDispatchResponse,
  ReadCanvasStateCommand,
  RemoveCanvasGroupCommand,
} from "@nudge-ui/agent-protocol";

const DEFAULT_COMMAND_TIMEOUT_MS = 5_000;
export const AGENT_CLAIM_TIMEOUT_MS = 30_000;
export const AGENT_ACKNOWLEDGMENT_TIMEOUT_MS = 60_000;

/** A clock port keeps command timeout and claim expiry tests deterministic. */
export interface BridgeClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const SYSTEM_CLOCK: BridgeClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

type WithOptionalCommandId<T extends CanvasCommand> = Omit<T, "commandId"> & { readonly commandId?: string };

export type CanvasCommandInput =
  | WithOptionalCommandId<ReadCanvasStateCommand>
  | WithOptionalCommandId<PresentRoutesCommand>
  | WithOptionalCommandId<FocusCanvasGroupCommand>
  | WithOptionalCommandId<FitCanvasCommand>
  | WithOptionalCommandId<RemoveCanvasGroupCommand>;

export type BridgeSessionErrorCode =
  | "project_not_found"
  | "origin_not_allowed"
  | "origin_mismatch"
  | "invalid_session"
  | "invalid_page_url"
  | "already_paired"
  | "browser_unpaired"
  | "listener_active"
  | "listener_unavailable"
  | "listener_cancelled"
  | "listener_aborted"
  | "request_in_flight"
  | "unknown_request"
  | "inactive_request"
  | "invalid_status"
  | "invalid_activity"
  | "invalid_canvas_command"
  | "invalid_routes"
  | "command_in_flight"
  | "no_command"
  | "unknown_command"
  | "session_claimed"
  | "agent_not_owner"
  | "session_closed";

/** A rejected session transition. Transports map the code to their own status. */
export class BridgeSessionError extends Error {
  readonly code: BridgeSessionErrorCode;

  constructor(code: BridgeSessionErrorCode, message: string) {
    super(message);
    this.name = "BridgeSessionError";
    this.code = code;
  }
}

/** One attached browser event stream; `send` returns false once the stream is gone. */
export interface BrowserStream {
  send(envelope: BridgeEnvelope): boolean;
  end(): void;
}

export interface BrowserGrant {
  readonly origin: string;
  readonly sessionToken: string;
}

export interface PromptDispatchInput {
  readonly prompt: string;
  readonly changeRevision?: number;
  readonly clientDispatchId?: string;
  readonly attachments: readonly AgentSketchAttachment[];
}

export interface ListenOptions {
  readonly signal?: AbortSignal;
  /** Shown in the browser while this listener is active. */
  readonly agentClientName?: string;
}

export interface BridgeSessionControls {
  getStatus(): AgentStatusSnapshot;
  pairBrowser(origin: string, pageUrl?: string): PairingResponse;
  /** Revokes the pairing and interrupts any working request. */
  disconnectBrowser(sessionToken: string): void;
  waitForPrompt(options?: ListenOptions): Promise<AgentDeliveredPrompt>;
  /** Retrieves an unacknowledged request, including its sketch attachments. */
  getRequest(requestId: string): AgentDeliveredPrompt;
  updateRequestStatus(update: AgentStatusUpdate | AgentRequestOutcome): void;
  reportActivity(activity: AgentActivity): void;
  /** Sends a Canvas command to the browser and waits for one bounded acknowledgement. */
  dispatchCanvasCommand(input: CanvasCommandInput): Promise<CanvasCommandResult>;
}

/** Browser-facing transitions trust their caller to have authorized the request first. */
export interface BridgeSession extends BridgeSessionControls {
  readonly projectId: string;
  readonly agentClaimed: boolean;
  assertProject(projectId: unknown): void;
  /** Accepts a configured origin, an allow-listed alias, or the paired origin. */
  authorizeOrigin(origin: string | null): string;
  authorizeBrowser(origin: string | null, sessionToken: string | null | undefined): BrowserGrant;
  /** Passing the current token refreshes the pairing's page instead of failing. */
  pairBrowser(origin: string, pageUrl?: string, sessionToken?: string): PairingResponse;
  /** Replaces any existing pairing after an explicit user choice. */
  takeOver(origin: string, pageUrl?: string): PairingResponse;
  /** Attaches a stream to the current pairing and sends it the current status. */
  attachStream(stream: BrowserStream): () => void;
  dispatchPrompt(input: PromptDispatchInput): PromptDispatchResponse;
  acknowledgeCanvas(result: CanvasCommandResult): void;
  claimAgent(agentId: string): void;
  /** Confirms the agent owns the session and extends its claim. */
  confirmAgent(agentId: string | null): void;
  releaseAgent(agentId: string | null): void;
  close(): void;
}

export interface BridgeSessionOptions {
  readonly projectId: string;
  readonly origin: string;
  readonly allowedOrigins?: readonly string[];
  readonly commandTimeoutMs?: number;
  readonly clock?: BridgeClock;
  readonly tokenFactory: () => string;
  readonly idFactory: () => string;
}

interface PendingPrompt {
  readonly resolve: (request: AgentDeliveredPrompt) => void;
  readonly reject: (error: Error) => void;
  readonly detachAbort: () => void;
}

interface PendingCanvasCommand {
  readonly command: CanvasCommand;
  readonly resolve: (result: CanvasCommandResult) => void;
  readonly timeout: unknown;
}

interface PairingTarget {
  readonly origin: string;
  readonly pageUrl?: string;
}

interface Pairing {
  readonly token: string;
  readonly origin: string;
  /** The last paired page, retained only for this process lifetime. */
  pageUrl: string | null;
}

type CurrentRequest = NonNullable<AgentStatusSnapshot["request"]>;

function canonicalOrigins(options: BridgeSessionOptions): string[] {
  const origins = [options.origin, ...(options.allowedOrigins ?? [])].map((candidate) => canonicalOrigin(candidate));
  if (origins[0] === null) throw new TypeError("origin must be a canonical HTTP(S) origin");
  if (origins.some((candidate) => candidate === null)) {
    throw new TypeError("allowedOrigins must contain canonical HTTP(S) origins");
  }
  return origins as string[];
}

export function createBridgeSession(options: BridgeSessionOptions): BridgeSession {
  const { projectId } = options;
  if (typeof projectId !== "string" || projectId.length === 0 || projectId.length > AGENT_PROTOCOL_LIMITS.projectId) {
    throw new TypeError("projectId must be a bounded non-empty string");
  }
  const allowedOrigins = canonicalOrigins(options);
  const timeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new TypeError("commandTimeoutMs must be between 1 and 60000 milliseconds");
  }
  const clock = options.clock ?? SYSTEM_CLOCK;

  let closed = false;
  let pairing: Pairing | null = null;
  const streams = new Set<BrowserStream>();
  let listener: PendingPrompt | null = null;
  let currentRequest: CurrentRequest | null = null;
  let deliveredRequest: AgentDeliveredPrompt | null = null;
  let acknowledgmentTimeout: unknown = null;
  let pendingCanvas: PendingCanvasCommand | null = null;
  let agentOwner: string | null = null;
  let agentClientName: string | undefined;
  let agentOwnerSeenAt = 0;
  let agentOwnerExpiry: unknown = null;

  const getStatus = (): AgentStatusSnapshot => {
    const listenerActive = listener !== null;
    const paired = pairing !== null;
    return {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      projectId,
      connection: deriveConnectionState({ listenerActive, paired, request: currentRequest }),
      listenerActive,
      paired,
      pageUrl: pairing?.pageUrl ?? null,
      ...(agentClientName === undefined ? {} : { agentClientName }),
      request: currentRequest,
    };
  };

  const envelope = (token: string, event: BridgeEvent): BridgeEnvelope => ({
    protocolVersion: AGENT_PROTOCOL_VERSION,
    projectId,
    sessionToken: token,
    event,
  });

  const publish = (event: BridgeEvent): void => {
    if (!pairing) return;
    const message = envelope(pairing.token, event);
    for (const stream of streams) {
      if (!stream.send(message)) streams.delete(stream);
    }
  };

  const publishStatus = (): void => publish({ type: "status", status: getStatus() });

  const authorizeOrigin = (candidate: string | null): string => {
    // An empty allow-list stays closed rather than trusting the first caller.
    if (candidate && (candidate === pairing?.origin || isAllowedOrigin(candidate, allowedOrigins))) return candidate;
    throw new BridgeSessionError("origin_not_allowed", "The browser origin is not allowed for this project.");
  };

  const requirePairing = (token: string | null | undefined): Pairing => {
    if (!pairing || token !== pairing.token) {
      throw new BridgeSessionError("invalid_session", "The browser session token is invalid or expired.");
    }
    return pairing;
  };

  const authorizeBrowser = (candidate: string | null, token: string | null | undefined): BrowserGrant => {
    const origin = authorizeOrigin(candidate);
    if (origin !== pairing?.origin) {
      throw new BridgeSessionError("origin_mismatch", "The browser origin does not match the paired project.");
    }
    return { origin, sessionToken: requirePairing(token).token };
  };

  const pairingTarget = (originValue: string, requestedPageUrl: string | undefined): PairingTarget => {
    const origin = authorizeOrigin(canonicalOrigin(originValue));
    if (requestedPageUrl === undefined) return { origin };
    if (!isSameOriginRoute({ url: requestedPageUrl }, origin)) {
      throw new BridgeSessionError("invalid_page_url", "pageUrl must be a bounded same-origin URL.");
    }
    return { origin, pageUrl: new URL(requestedPageUrl, origin).href };
  };

  const pairingResponse = ({ token, origin, pageUrl }: Pairing): PairingResponse => ({
    protocolVersion: AGENT_PROTOCOL_VERSION,
    projectId,
    origin,
    sessionToken: token,
    ...(pageUrl === null ? {} : { pageUrl }),
    status: getStatus(),
  });

  const openPairing = (target: PairingTarget): PairingResponse => {
    const token = options.tokenFactory();
    if (!token || token.length > AGENT_PROTOCOL_LIMITS.sessionToken) {
      throw new Error("tokenFactory returned an invalid session token");
    }
    const opened: Pairing = { token, origin: target.origin, pageUrl: target.pageUrl ?? null };
    pairing = opened;
    publish({ type: "connected", status: getStatus() });
    const response = pairingResponse(opened);
    publishStatus();
    return response;
  };

  const settleCanvas = (code: string, message: string): void => {
    if (!pendingCanvas) return;
    const pending = pendingCanvas;
    pendingCanvas = null;
    clock.clearTimeout(pending.timeout);
    pending.resolve({ commandId: pending.command.commandId, ok: false, error: { code, message } });
  };

  const clearAcknowledgmentTimeout = (): void => {
    if (acknowledgmentTimeout !== null) clock.clearTimeout(acknowledgmentTimeout);
    acknowledgmentTimeout = null;
  };

  const interruptWorkingRequest = (reason: string): void => {
    if (currentRequest?.status !== "working" && currentRequest?.status !== "delivered") return;
    clearAcknowledgmentTimeout();
    deliveredRequest = null;
    currentRequest = { ...currentRequest, status: "interrupted", error: reason };
    publishStatus();
  };

  const revokePairing = (): void => {
    interruptWorkingRequest("The paired browser disconnected while the request was in flight.");
    publish({ type: "disconnected", reason: "browser_disconnected" });
    pairing = null;
    for (const stream of streams) stream.end();
    streams.clear();
    settleCanvas("browser_disconnected", "The paired browser disconnected before acknowledging the command.");
  };

  const pairBrowser = (originValue: string, requestedPageUrl?: string, presentedToken?: string): PairingResponse => {
    const target = pairingTarget(originValue, requestedPageUrl);
    if (!pairing) return openPairing(target);
    if (presentedToken !== pairing.token) {
      throw new BridgeSessionError("already_paired", "A browser is already paired with this project.");
    }
    pairing.pageUrl = target.pageUrl ?? pairing.pageUrl;
    return pairingResponse(pairing);
  };

  const takeOver = (originValue: string, requestedPageUrl?: string): PairingResponse => {
    const target = pairingTarget(originValue, requestedPageUrl);
    if (pairing) revokePairing();
    return openPairing(target);
  };

  const disconnectBrowser = (token: string): void => {
    requirePairing(token);
    revokePairing();
  };

  const attachStream = (stream: BrowserStream): (() => void) => {
    if (!pairing) throw new BridgeSessionError("invalid_session", "The browser session token is invalid or expired.");
    streams.add(stream);
    if (!stream.send(envelope(pairing.token, { type: "status", status: getStatus() }))) streams.delete(stream);
    return () => { streams.delete(stream); };
  };

  const cancelListener = (reason: string): void => {
    if (!listener) return;
    const pending = listener;
    listener = null;
    pending.detachAbort();
    pending.reject(new BridgeSessionError("listener_cancelled", reason));
    publishStatus();
  };

  const waitForPrompt = async ({ signal, agentClientName: clientName }: ListenOptions = {}): Promise<AgentDeliveredPrompt> => {
    if (closed) throw new BridgeSessionError("session_closed", "The browser bridge is closed.");
    if (listener) throw new BridgeSessionError("listener_active", "A listening call is already active for this project.");
    if (signal?.aborted) throw new BridgeSessionError("listener_aborted", "The listening call was aborted.");
    if (currentRequest?.status === "working") {
      throw new BridgeSessionError("request_in_flight", `Request ${currentRequest.requestId} is already working. Report its outcome before listening again.`);
    }
    agentClientName = clientName?.trim().slice(0, AGENT_PROTOCOL_LIMITS.agentClientName) || undefined;
    if (currentRequest?.status === "delivered" && deliveredRequest) {
      publishStatus();
      return structuredClone(deliveredRequest);
    }
    // A terminal outcome stays visible until the agent rearms; rearming ends the old request.
    currentRequest = null;
    deliveredRequest = null;
    return await new Promise<AgentDeliveredPrompt>((resolve, reject) => {
      const onAbort = (): void => {
        if (listener !== pending) return;
        listener = null;
        reject(new BridgeSessionError("listener_aborted", "The listening call was aborted."));
        publishStatus();
      };
      const pending: PendingPrompt = {
        resolve,
        reject,
        detachAbort: () => signal?.removeEventListener("abort", onAbort),
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      listener = pending;
      publishStatus();
    });
  };

  const dispatchPrompt = (input: PromptDispatchInput): PromptDispatchResponse => {
    if (!listener) throw new BridgeSessionError("listener_unavailable", "The agent has not opened a listening call.");
    if (currentRequest) throw new BridgeSessionError("request_in_flight", "Another Nudge request is still in flight.");
    const { attachments } = input;
    const request: AgentPromptRequest = {
      requestId: options.idFactory(),
      projectId,
      prompt: input.prompt,
      ...(input.changeRevision === undefined ? {} : { changeRevision: input.changeRevision }),
      ...(input.clientDispatchId === undefined ? {} : { clientDispatchId: input.clientDispatchId }),
      ...(attachments.length === 0 ? {} : { sketches: attachments.map(({ data: _data, ...metadata }) => metadata) }),
    };
    const pending = listener;
    listener = null;
    pending.detachAbort();
    currentRequest = { ...request, status: "delivered" };
    deliveredRequest = { ...request, ...(attachments.length === 0 ? {} : { attachments }) };
    acknowledgmentTimeout = clock.setTimeout(() => {
      if (currentRequest?.requestId !== request.requestId || currentRequest.status !== "delivered") return;
      interruptWorkingRequest("The agent did not acknowledge this request within 60 seconds. Ask the agent to listen again, then resend the prompt.");
    }, AGENT_ACKNOWLEDGMENT_TIMEOUT_MS);
    pending.resolve(structuredClone(deliveredRequest));
    publishStatus();
    return { request, status: "delivered" };
  };

  const getRequest = (requestId: string): AgentDeliveredPrompt => {
    if (!deliveredRequest || deliveredRequest.requestId !== requestId || currentRequest?.status !== "delivered") {
      throw new BridgeSessionError("unknown_request", "No unacknowledged request exists with this ID.");
    }
    return structuredClone(deliveredRequest);
  };

  const updateRequestStatus = (update: AgentStatusUpdate | AgentRequestOutcome): void => {
    if (!isAgentStatusUpdate(update)) throw new BridgeSessionError("invalid_status", "update must be a valid agent status update.");
    if (currentRequest?.requestId !== update.requestId) {
      throw new BridgeSessionError("unknown_request", "The request is not in flight for this project.");
    }
    if (currentRequest.status === update.status && currentRequest.status !== "working") return;
    if (currentRequest.status !== "delivered" && currentRequest.status !== "working") {
      throw new BridgeSessionError("inactive_request", "The request already has a terminal outcome.");
    }
    clearAcknowledgmentTimeout();
    deliveredRequest = null;
    currentRequest = update.status === "working"
      ? { ...currentRequest, status: "working" }
      : {
        ...currentRequest,
        status: update.status,
        ...(update.summary === undefined ? {} : { summary: update.summary }),
        ...(update.error === undefined ? {} : { error: update.error }),
      };
    publishStatus();
  };

  const reportActivity = (activity: AgentActivity): void => {
    if (!isAgentActivity(activity)) {
      throw new BridgeSessionError("invalid_activity", "activity must identify a workspace-relative source file.");
    }
    if (currentRequest?.requestId !== activity.requestId || currentRequest.status !== "working") {
      throw new BridgeSessionError("inactive_request", "Activity requires the currently working request.");
    }
    publish({ type: "activity", activity });
  };

  const dispatchCanvasCommand = async (input: CanvasCommandInput): Promise<CanvasCommandResult> => {
    if (closed) throw new BridgeSessionError("session_closed", "The browser bridge is closed.");
    if (!pairing) throw new BridgeSessionError("browser_unpaired", "No browser is paired with this project.");
    const { origin } = pairing;
    if (pendingCanvas) throw new BridgeSessionError("command_in_flight", "A Canvas command is already in flight.");
    const command = { ...input, commandId: input.commandId ?? options.idFactory() } as CanvasCommand;
    if (!isCanvasCommand(command)) throw new BridgeSessionError("invalid_canvas_command", "command must be a valid Canvas command.");
    if (command.type === "present-routes") {
      // The browser checks routes again; rejecting here keeps cross-origin URLs out of the project.
      try {
        validateRoutes(command.routes, origin);
      } catch (error) {
        throw new BridgeSessionError("invalid_routes", error instanceof Error ? error.message : "Canvas routes are invalid.");
      }
    }
    return await new Promise<CanvasCommandResult>((resolve) => {
      const timeout = clock.setTimeout(() => {
        if (pendingCanvas?.command.commandId !== command.commandId) return;
        settleCanvas("ack_timeout", "The browser did not acknowledge the Canvas command in time.");
      }, timeoutMs);
      pendingCanvas = { command, resolve, timeout };
      publish({ type: "canvas-command", command });
    });
  };

  const acknowledgeCanvas = (result: CanvasCommandResult): void => {
    if (!pendingCanvas) throw new BridgeSessionError("no_command", "No Canvas command is awaiting an acknowledgement.");
    if (result.commandId !== pendingCanvas.command.commandId) {
      throw new BridgeSessionError("unknown_command", "The Canvas command is no longer awaiting an acknowledgement.");
    }
    const pending = pendingCanvas;
    pendingCanvas = null;
    clock.clearTimeout(pending.timeout);
    pending.resolve(result);
  };

  const clearAgentOwner = (): void => {
    if (agentOwnerExpiry !== null) clock.clearTimeout(agentOwnerExpiry);
    agentOwnerExpiry = null;
    agentOwner = null;
    agentClientName = undefined;
    agentOwnerSeenAt = 0;
  };

  const releaseAgentOwner = (reason: string): void => {
    clearAgentOwner();
    cancelListener(reason);
    interruptWorkingRequest(reason);
    settleCanvas("agent_released", reason);
    publishStatus();
  };

  const scheduleAgentOwnerExpiry = (): void => {
    if (agentOwnerExpiry !== null) clock.clearTimeout(agentOwnerExpiry);
    agentOwnerExpiry = null;
    const expectedOwner = agentOwner;
    if (!expectedOwner) return;
    const expireIfStale = (): void => {
      agentOwnerExpiry = null;
      if (agentOwner !== expectedOwner) return;
      const remaining = AGENT_CLAIM_TIMEOUT_MS - (clock.now() - agentOwnerSeenAt);
      if (remaining > 0) {
        agentOwnerExpiry = clock.setTimeout(expireIfStale, remaining);
        return;
      }
      releaseAgentOwner("The MCP adapter claim expired.");
    };
    agentOwnerExpiry = clock.setTimeout(expireIfStale, AGENT_CLAIM_TIMEOUT_MS);
  };

  const claimAgent = (agentId: string): void => {
    if (agentOwner && agentOwner !== agentId) {
      if (clock.now() - agentOwnerSeenAt <= AGENT_CLAIM_TIMEOUT_MS) {
        throw new BridgeSessionError("session_claimed", "Another MCP adapter owns this project session.");
      }
      releaseAgentOwner("The previous MCP adapter claim expired.");
    }
    agentOwner = agentId;
    agentOwnerSeenAt = clock.now();
    scheduleAgentOwnerExpiry();
  };

  const confirmAgent = (agentId: string | null): void => {
    if (!agentId || agentOwner !== agentId) {
      throw new BridgeSessionError("agent_not_owner", "This MCP adapter does not own the project session.");
    }
    agentOwnerSeenAt = clock.now();
    scheduleAgentOwnerExpiry();
  };

  const releaseAgent = (agentId: string | null): void => {
    confirmAgent(agentId);
    releaseAgentOwner(`Agent ${agentId} released the project session.`);
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    clearAgentOwner();
    clearAcknowledgmentTimeout();
    deliveredRequest = null;
    cancelListener("bridge_closed");
    settleCanvas("bridge_closed", "The browser bridge closed before acknowledging the command.");
    for (const stream of streams) stream.end();
    streams.clear();
    pairing = null;
  };

  return {
    projectId,
    get agentClaimed() { return agentOwner !== null; },
    assertProject(candidate) {
      if (candidate !== projectId) {
        throw new BridgeSessionError("project_not_found", "The requested project is not served by this bridge.");
      }
    },
    authorizeOrigin,
    authorizeBrowser,
    getStatus,
    pairBrowser,
    takeOver,
    disconnectBrowser,
    attachStream,
    waitForPrompt,
    dispatchPrompt,
    getRequest,
    updateRequestStatus,
    reportActivity,
    dispatchCanvasCommand,
    acknowledgeCanvas,
    claimAgent,
    confirmAgent,
    releaseAgent,
    close,
  };
}
