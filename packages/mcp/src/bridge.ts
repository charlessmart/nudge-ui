import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import {
  AGENT_PROTOCOL_LIMITS,
  AGENT_PROTOCOL_VERSION,
  canonicalOrigin,
  isAgentStatusUpdate,
  isAllowedOrigin,
  isCanvasCommand,
  isCanvasGroup,
  isCanvasState,
  isSameOriginRoute,
  validateSketchAttachments,
  validateRoutes,
} from "@nudge-ui/agent-protocol";
import type {
  AgentConnectionState,
  AgentDeliveredPrompt,
  AgentPromptRequest,
  AgentRequestOutcome,
  AgentStatusSnapshot,
  AgentStatusUpdate,
  BridgeCanvasCommandEvent,
  BridgeConnectedEvent,
  BridgeEnvelope,
  BridgeEvent,
  BridgeStatusEvent,
  CanvasCommand,
  CanvasCommandAcknowledgement,
  CanvasCommandResult,
  PairingResponse,
  PromptDispatchResponse,
  AgentSketchAttachment,
} from "@nudge-ui/agent-protocol";
import { AGENT_CONTROL_ENDPOINTS, BRIDGE_ENDPOINTS, type BridgeHttpError } from "./protocol.ts";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const MAX_BODY_BYTES = 256 * 1024;
const MAX_PROMPT_BODY_BYTES = 12 * 1024 * 1024;
const DEFAULT_COMMAND_TIMEOUT_MS = 5_000;
const AGENT_CLAIM_TIMEOUT_MS = 30_000;

/** A clock port keeps command timeout tests deterministic. */
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

export interface BrowserBridgeOptions {
  /** Stable project identity used to scope every browser message. */
  readonly projectId: string;
  /** Canonical app origin that browser routes must use. */
  readonly origin?: string;
  /** Explicit browser origins accepted by the loopback HTTP server. */
  readonly allowedOrigins?: readonly string[];
  readonly host?: "127.0.0.1" | "::1" | "localhost";
  /** Use port 0 in tests or when several projects run concurrently. */
  readonly port?: number;
  readonly commandTimeoutMs?: number;
  readonly clock?: BridgeClock;
  /** Test seam; production defaults to cryptographically random tokens. */
  readonly tokenFactory?: () => string;
  /** Test seam; production defaults to random UUIDs. */
  readonly idFactory?: () => string;
  /** Private credential for a separately running MCP adapter. */
  readonly agentControlToken?: string;
  /**
   * Best-effort hook used by the CLI to reopen the last paired page when an
   * agent rearms listening but no browser controller stream is attached.
   */
  readonly onControllerUnavailable?: (pageUrl: string) => Promise<void> | void;
}

export interface BridgeAddress {
  readonly host: string;
  readonly port: number;
  readonly url: string;
}

export type BridgeLifecycle = "created" | "listening" | "closed";

export interface BrowserBridge {
  readonly httpServer: Server;
  readonly projectId: string;
  readonly origin: string | null;
  /** The configured origin, or the explicitly approved browser origin. */
  readonly effectiveOrigin: string | null;
  readonly lifecycle: BridgeLifecycle;
  readonly address: BridgeAddress | null;
  readonly sessionToken: string | null;
  readonly lastPageUrl: string | null;
  /** Current companion/browser state, safe to expose to the browser. */
  getStatus(): AgentStatusSnapshot;
  start(): Promise<BridgeAddress>;
  close(): Promise<void>;
  /** Blocks until a paired browser dispatches a prompt. */
  waitForPrompt(signal?: AbortSignal): Promise<AgentDeliveredPrompt>;
  /** Marks the agent-side listener as stopped without ending the project. */
  cancelListener(reason?: string): void;
  /** Reports the terminal result for the currently running browser request. */
  updateRequestStatus(update: AgentStatusUpdate | AgentRequestOutcome): void;
  /** Sends a Canvas command to the browser and waits for one bounded ack. */
  dispatchCanvasCommand(command: CanvasCommandInput): Promise<CanvasCommandResult>;
  /** Returns the currently paired browser token to the host process only. */
  pairBrowser(projectId: string, requestOrigin: string, pageUrl?: string): PairingResponse;
  /** Revokes a browser pairing; no data is written to disk. */
  disconnectBrowser(token: string): void;
}

export type CanvasCommandInput =
  | Omit<import("@nudge-ui/agent-protocol").ReadCanvasStateCommand, "commandId"> & { readonly commandId?: string }
  | Omit<import("@nudge-ui/agent-protocol").PresentRoutesCommand, "commandId"> & { readonly commandId?: string }
  | Omit<import("@nudge-ui/agent-protocol").FocusCanvasGroupCommand, "commandId"> & { readonly commandId?: string }
  | Omit<import("@nudge-ui/agent-protocol").FitCanvasCommand, "commandId"> & { readonly commandId?: string }
  | Omit<import("@nudge-ui/agent-protocol").RemoveCanvasGroupCommand, "commandId"> & { readonly commandId?: string };

class BridgeRequestError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "BridgeRequestError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

interface PendingPrompt {
  readonly resolve: (request: AgentDeliveredPrompt) => void;
  readonly reject: (error: Error) => void;
  readonly signal?: AbortSignal;
  abortHandler?: () => void;
}

interface PendingCanvasCommand {
  readonly command: CanvasCommand;
  readonly resolve: (result: CanvasCommandResult) => void;
  readonly timeout: unknown;
}

type CurrentRequest = NonNullable<AgentStatusSnapshot["request"]>;

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function randomId(): string {
  return randomUUID();
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
} {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: Error) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function loopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return LOOPBACK_HOSTS.has(address) || address === "::ffff:127.0.0.1";
}

function validPort(port: number): boolean {
  return Number.isInteger(port) && port >= 0 && port <= 65_535;
}

function headerValue(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return undefined;
  return value;
}

function requestOrigin(request: IncomingMessage): string | null {
  return canonicalOrigin(headerValue(request, "origin"));
}

function parseProjectId(value: string | null | undefined, expected: string): void {
  if (value !== expected) {
    throw new BridgeRequestError(404, "project_not_found", "The requested project is not served by this companion.");
  }
}

function parseToken(value: string | null | undefined, expected: string | null): void {
  if (!expected || value !== expected) {
    throw new BridgeRequestError(401, "invalid_session", "The browser session token is invalid or expired.");
  }
}

function jsonHeaders(response: ServerResponse, origin: string | null): void {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
  }
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown, origin: string | null): void {
  jsonHeaders(response, origin);
  response.statusCode = statusCode;
  response.end(JSON.stringify(body));
}

function sendError(response: ServerResponse, error: unknown, origin: string | null): void {
  if (error instanceof BridgeRequestError) {
    const body: BridgeHttpError = { error: { code: error.code, message: error.message } };
    sendJson(response, error.statusCode, body, origin);
    return;
  }
  sendJson(response, 500, { error: { code: "internal_error", message: "The bridge could not complete the request." } }, origin);
}

async function readJsonBody(
  request: IncomingMessage,
  maxBytes = MAX_BODY_BYTES,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new BridgeRequestError(413, "body_too_large", "The bridge request body is too large.");
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BridgeRequestError(400, "invalid_json", "The bridge request body must be valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BridgeRequestError(400, "invalid_body", "The bridge request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function pngDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24
    || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function parseSketchAttachments(value: unknown): AgentSketchAttachment[] {
  let attachments: AgentSketchAttachment[];
  try {
    attachments = validateSketchAttachments(value);
  } catch (error) {
    throw new BridgeRequestError(400, "invalid_sketches", error instanceof Error ? error.message : "Sketch attachments are invalid.");
  }
  for (const [index, attachment] of attachments.entries()) {
    const bytes = Buffer.from(attachment.data, "base64");
    if (bytes.length !== attachment.byteSize || bytes.toString("base64") !== attachment.data) {
      throw new BridgeRequestError(400, "invalid_sketches", `attachments[${index}] is not canonical base64 PNG data.`);
    }
    const dimensions = pngDimensions(bytes);
    if (!dimensions || dimensions.width !== attachment.width || dimensions.height !== attachment.height
      || dimensions.width > 2_048 || dimensions.height > 2_048) {
      throw new BridgeRequestError(400, "invalid_sketches", `attachments[${index}] has invalid PNG dimensions.`);
    }
  }
  return attachments;
}

function createEnvelope(projectId: string, sessionToken: string, event: BridgeEvent): BridgeEnvelope {
  return {
    protocolVersion: AGENT_PROTOCOL_VERSION,
    projectId,
    sessionToken,
    event,
  };
}

function writeSse(response: ServerResponse, envelope: BridgeEnvelope): void {
  if (response.destroyed || response.writableEnded) return;
  response.write(`event: ${envelope.event.type}\ndata: ${JSON.stringify(envelope)}\n\n`);
}

function connectionFor(listenerActive: boolean, paired: boolean, request: AgentStatusSnapshot["request"]): AgentConnectionState {
  if (request?.status === "working") return "working";
  if (paired) return "paired";
  if (listenerActive) return "listening";
  return "offline";
}

function statusWith(
  projectId: string,
  listenerActive: boolean,
  paired: boolean,
  request: AgentStatusSnapshot["request"],
  pageUrl: string | null,
): AgentStatusSnapshot {
  return {
    protocolVersion: AGENT_PROTOCOL_VERSION,
    projectId,
    connection: connectionFor(listenerActive, paired, request),
    listenerActive,
    paired,
    pageUrl,
    request,
  };
}

/**
 * Creates the local browser bridge. It binds only to loopback and keeps every
 * pairing, prompt, command, and acknowledgement in process memory.
 */
export function createLoopbackBridge(options: BrowserBridgeOptions): BrowserBridge {
  if (typeof options.projectId !== "string" || options.projectId.length === 0
    || options.projectId.length > AGENT_PROTOCOL_LIMITS.projectId) {
    throw new TypeError("projectId must be a bounded non-empty string");
  }
  const configuredOrigin = options.origin === undefined ? null : canonicalOrigin(options.origin);
  if (options.origin !== undefined && !configuredOrigin) throw new TypeError("origin must be a canonical HTTP(S) origin");
  const host = options.host ?? "127.0.0.1";
  if (!LOOPBACK_HOSTS.has(host)) throw new TypeError("The browser bridge must bind to a loopback host");
  const port = options.port ?? 0;
  if (!validPort(port)) throw new TypeError("port must be between 0 and 65535");
  const timeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new TypeError("commandTimeoutMs must be between 1 and 60000 milliseconds");
  }
  const allowedOrigins = [
    ...(configuredOrigin ? [configuredOrigin] : []),
    ...(options.allowedOrigins ?? []),
  ].map((candidate) => canonicalOrigin(candidate));
  if (allowedOrigins.some((candidate) => candidate === null)) {
    throw new TypeError("allowedOrigins must contain canonical HTTP(S) origins");
  }
  const canonicalAllowedOrigins = allowedOrigins as string[];
  const clock = options.clock ?? SYSTEM_CLOCK;
  const tokenFactory = options.tokenFactory ?? randomToken;
  const idFactory = options.idFactory ?? randomId;
  const agentControlToken = options.agentControlToken;
  if (agentControlToken !== undefined && (agentControlToken.length < 32 || agentControlToken.length > 256)) {
    throw new TypeError("agentControlToken must contain between 32 and 256 characters");
  }

  let lifecycle: BridgeLifecycle = "created";
  let currentAddress: BridgeAddress | null = null;
  let sessionToken: string | null = null;
  let pairedOrigin: string | null = null;
  let lastPageUrl: string | null = null;
  const sseClients = new Set<ServerResponse>();
  let listener: PendingPrompt | null = null;
  let currentRequest: CurrentRequest | null = null;
  let pendingCanvas: PendingCanvasCommand | null = null;
  let closePromise: Promise<void> | null = null;
  let startPromise: Promise<BridgeAddress> | null = null;
  let agentOwner: string | null = null;
  let agentOwnerSeenAt = 0;
  let agentOwnerExpiry: unknown | null = null;

  const getStatus = (): AgentStatusSnapshot => statusWith(
    options.projectId,
    listener !== null,
    sessionToken !== null,
    currentRequest,
    lastPageUrl,
  );

  const broadcast = (event: BridgeEvent): void => {
    if (!sessionToken) return;
    const envelope = createEnvelope(options.projectId, sessionToken, event);
    for (const response of [...sseClients]) {
      if (response.destroyed || response.writableEnded) {
        sseClients.delete(response);
        continue;
      }
      try {
        writeSse(response, envelope);
      } catch {
        sseClients.delete(response);
        response.destroy();
      }
    }
  };

  const broadcastStatus = (): void => {
    const statusEvent: BridgeStatusEvent = { type: "status", status: getStatus() };
    broadcast(statusEvent);
  };

  const originIsAllowed = (candidate: string | null): candidate is string => {
    if (!candidate) return false;
    // Once paired, the explicitly approved browser's exact origin remains the
    // only origin accepted. Before pairing, only an origin configured by the
    // host (directly or through the allow-list) is eligible. An empty list is
    // deliberately closed rather than a trust-on-first-use wildcard.
    if (pairedOrigin === candidate) return true;
    return isAllowedOrigin(candidate, canonicalAllowedOrigins);
  };

  const requireBrowserRequest = (request: IncomingMessage, url: URL, bodyToken?: unknown): string => {
    if (!loopbackAddress(request.socket.remoteAddress)) {
      throw new BridgeRequestError(403, "loopback_only", "The browser bridge accepts loopback connections only.");
    }
    const incomingOrigin = requestOrigin(request);
    if (!originIsAllowed(incomingOrigin)) {
      throw new BridgeRequestError(403, "origin_not_allowed", "The browser origin is not allowed for this project.");
    }
    if (pairedOrigin !== incomingOrigin) {
      throw new BridgeRequestError(403, "origin_mismatch", "The browser origin does not match the paired project.");
    }
    const candidate = typeof bodyToken === "string" ? bodyToken : url.searchParams.get("sessionToken");
    parseToken(candidate, sessionToken);
    return incomingOrigin;
  };

  const handleOptions = (request: IncomingMessage, response: ServerResponse): void => {
    const incomingOrigin = requestOrigin(request);
    if (incomingOrigin && !originIsAllowed(incomingOrigin)) {
      sendError(response, new BridgeRequestError(403, "origin_not_allowed", "The browser origin is not allowed for this project."), null);
      return;
    }
    if (incomingOrigin) {
      response.setHeader("Access-Control-Allow-Origin", incomingOrigin);
      response.setHeader("Access-Control-Allow-Credentials", "true");
      response.setHeader("Vary", "Origin");
    }
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.statusCode = 204;
    response.end();
  };

  const handleHealth = (request: IncomingMessage, response: ServerResponse, url: URL): void => {
    if (!loopbackAddress(request.socket.remoteAddress)) {
      throw new BridgeRequestError(403, "loopback_only", "The browser bridge accepts loopback connections only.");
    }
    const incomingOrigin = requestOrigin(request);
    if (!originIsAllowed(incomingOrigin)) {
      throw new BridgeRequestError(403, "origin_not_allowed", "The browser origin is not allowed for this project.");
    }
    parseProjectId(url.searchParams.get("projectId"), options.projectId);
    sendJson(response, 200, {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      projectId: options.projectId,
      origin: incomingOrigin,
      status: getStatus(),
      sessionRequired: true,
      pageUrl: lastPageUrl,
    }, incomingOrigin);
  };

  const readPairRequest = async (request: IncomingMessage): Promise<{
    readonly body: Record<string, unknown>;
    readonly incomingOrigin: string;
    readonly requestedPageUrl?: string;
  }> => {
    if (!loopbackAddress(request.socket.remoteAddress)) {
      throw new BridgeRequestError(403, "loopback_only", "The browser bridge accepts loopback connections only.");
    }
    const incomingOrigin = requestOrigin(request);
    if (!originIsAllowed(incomingOrigin)) {
      throw new BridgeRequestError(403, "origin_not_allowed", "The browser origin is not allowed for this project.");
    }
    const body = await readJsonBody(request);
    parseProjectId(typeof body.projectId === "string" ? body.projectId : null, options.projectId);
    const requestedOrigin = canonicalOrigin(body.origin);
    if (!requestedOrigin || requestedOrigin !== incomingOrigin) {
      throw new BridgeRequestError(403, "origin_mismatch", "Pairing requires an explicitly configured project origin.");
    }
    let requestedPageUrl: string | undefined;
    if (body.pageUrl !== undefined) {
      if (typeof body.pageUrl !== "string" || body.pageUrl.length === 0 || body.pageUrl.length > AGENT_PROTOCOL_LIMITS.routeUrl
        || !isSameOriginRoute({ url: body.pageUrl }, requestedOrigin)) {
        throw new BridgeRequestError(400, "invalid_page_url", "pageUrl must be a bounded same-origin URL.");
      }
      requestedPageUrl = new URL(body.pageUrl, requestedOrigin).href;
    }
    return { body, incomingOrigin, requestedPageUrl };
  };

  const handlePair = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const { body, incomingOrigin, requestedPageUrl } = await readPairRequest(request);
    if (sessionToken) {
      if (body.sessionToken !== sessionToken) {
        throw new BridgeRequestError(409, "already_paired", "A browser is already paired with this project.");
      }
      lastPageUrl = requestedPageUrl ?? lastPageUrl;
      const existing: PairingResponse = {
        protocolVersion: AGENT_PROTOCOL_VERSION,
        projectId: options.projectId,
        origin: pairedOrigin!,
        sessionToken,
        ...(lastPageUrl === null ? {} : { pageUrl: lastPageUrl }),
        status: getStatus(),
      };
      sendJson(response, 200, existing, incomingOrigin);
      return;
    }
    sessionToken = tokenFactory();
    if (!sessionToken || sessionToken.length > AGENT_PROTOCOL_LIMITS.sessionToken) {
      throw new Error("tokenFactory returned an invalid session token");
    }
    pairedOrigin = incomingOrigin;
    lastPageUrl = requestedPageUrl ?? null;
    const connected: BridgeConnectedEvent = { type: "connected", status: getStatus() };
    broadcast(connected);
    const result: PairingResponse = {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      projectId: options.projectId,
      origin: pairedOrigin!,
      sessionToken,
      ...(lastPageUrl === null ? {} : { pageUrl: lastPageUrl }),
      status: getStatus(),
    };
    sendJson(response, 200, result, incomingOrigin);
    broadcastStatus();
  };

  const handleTakeover = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const { incomingOrigin, requestedPageUrl } = await readPairRequest(request);
    // Takeover is intentionally separate from normal pairing. The caller has
    // made an explicit UI choice to revoke the existing browser session.
    if (sessionToken) disconnectBrowser(sessionToken);
    const pairing = pairBrowser(options.projectId, incomingOrigin, requestedPageUrl);
    sendJson(response, 200, pairing, incomingOrigin);
  };

  const handleEvents = (request: IncomingMessage, response: ServerResponse, url: URL): void => {
    parseProjectId(url.searchParams.get("projectId"), options.projectId);
    const incomingOrigin = requireBrowserRequest(request, url);
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-store");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.setHeader("Access-Control-Allow-Origin", incomingOrigin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
    response.flushHeaders();
    sseClients.add(response);
    const initial: BridgeStatusEvent = { type: "status", status: getStatus() };
    writeSse(response, createEnvelope(options.projectId, sessionToken!, initial));
    const closeClient = (): void => {
      sseClients.delete(response);
    };
    request.once("close", closeClient);
    response.once("close", closeClient);
  };

  const handleStatus = (request: IncomingMessage, response: ServerResponse, url: URL): void => {
    parseProjectId(url.searchParams.get("projectId"), options.projectId);
    const incomingOrigin = requireBrowserRequest(request, url);
    sendJson(response, 200, getStatus(), incomingOrigin);
  };

  const handlePrompt = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const body = await readJsonBody(request, MAX_PROMPT_BODY_BYTES);
    const incomingOrigin = requireBrowserRequest(
      request,
      new URL("http://bridge.invalid"),
      body.sessionToken,
    );
    parseProjectId(typeof body.projectId === "string" ? body.projectId : null, options.projectId);
    if (typeof body.prompt !== "string" || body.prompt.length === 0 || body.prompt.length > AGENT_PROTOCOL_LIMITS.prompt) {
      throw new BridgeRequestError(400, "invalid_prompt", "prompt must be a bounded non-empty string");
    }
    if (body.changeRevision !== undefined
      && (!Number.isSafeInteger(body.changeRevision) || (body.changeRevision as number) < 0)) {
      throw new BridgeRequestError(400, "invalid_revision", "changeRevision must be a non-negative safe integer");
    }
    if (body.clientDispatchId !== undefined
      && (typeof body.clientDispatchId !== "string"
        || body.clientDispatchId.length === 0
        || body.clientDispatchId.length > AGENT_PROTOCOL_LIMITS.clientDispatchId)) {
      throw new BridgeRequestError(400, "invalid_dispatch_id", "clientDispatchId must be a bounded non-empty string");
    }
    const attachments = parseSketchAttachments(body.attachments);
    if (!listener) {
      throw new BridgeRequestError(409, "listener_unavailable", "The agent has not opened a listening call.");
    }
    if (currentRequest) {
      throw new BridgeRequestError(409, "request_in_flight", "Another Nudge request is still in flight.");
    }
    const prompt: AgentPromptRequest = {
      requestId: idFactory(),
      projectId: options.projectId,
      prompt: body.prompt,
      ...(body.changeRevision === undefined ? {} : { changeRevision: body.changeRevision as number }),
      ...(body.clientDispatchId === undefined ? {} : { clientDispatchId: body.clientDispatchId }),
      ...(attachments.length === 0 ? {} : { sketches: attachments.map(({ data: _data, ...metadata }) => metadata) }),
    };
    const delivered: AgentDeliveredPrompt = {
      ...prompt,
      ...(attachments.length === 0 ? {} : { attachments }),
    };
    const pending = listener;
    listener = null;
    if (pending.abortHandler && pending.signal) pending.signal.removeEventListener("abort", pending.abortHandler);
    currentRequest = { ...prompt, status: "working" };
    pending.resolve(delivered);
    const result: PromptDispatchResponse = { request: prompt, status: "working" };
    sendJson(response, 202, result, incomingOrigin);
    broadcastStatus();
  };

  const handleCanvasAcknowledgement = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const body = await readJsonBody(request);
    const url = new URL("http://bridge.invalid");
    const incomingOrigin = requireBrowserRequest(request, url, body.sessionToken);
    parseProjectId(typeof body.projectId === "string" ? body.projectId : null, options.projectId);
    if (!pendingCanvas) throw new BridgeRequestError(409, "no_command", "No Canvas command is awaiting an acknowledgement.");
    if (typeof body.commandId !== "string" || body.commandId !== pendingCanvas.command.commandId) {
      throw new BridgeRequestError(409, "unknown_command", "The Canvas command is no longer awaiting an acknowledgement.");
    }
    if (typeof body.ok !== "boolean") throw new BridgeRequestError(400, "invalid_acknowledgement", "ok must be a boolean");
    // Acknowledgement payloads flow back to the agent verbatim, so every
    // optional field is validated before it is accepted into the result.
    if (body.state !== undefined && !isCanvasState(body.state)) {
      throw new BridgeRequestError(400, "invalid_acknowledgement", "state must be a valid Canvas state.");
    }
    if (body.group !== undefined && !isCanvasGroup(body.group)) {
      throw new BridgeRequestError(400, "invalid_acknowledgement", "group must be a valid Canvas group.");
    }
    if (body.error !== undefined) {
      const error = body.error as Record<string, unknown> | null | undefined;
      if (typeof error !== "object" || error === null
        || typeof error.code !== "string" || typeof error.message !== "string") {
        throw new BridgeRequestError(400, "invalid_acknowledgement", "error must include string code and message fields.");
      }
    }
    const acknowledgement: CanvasCommandAcknowledgement = {
      commandId: body.commandId,
      ok: body.ok,
      ...(body.state === undefined ? {} : { state: body.state as CanvasCommandAcknowledgement["state"] }),
      ...(body.group === undefined ? {} : { group: body.group as CanvasCommandAcknowledgement["group"] }),
      ...(body.error === undefined ? {} : { error: body.error as CanvasCommandAcknowledgement["error"] }),
    };
    if (acknowledgement.ok && acknowledgement.error) {
      throw new BridgeRequestError(400, "invalid_acknowledgement", "A successful acknowledgement cannot include an error.");
    }
    const pendingCommand = pendingCanvas;
    pendingCanvas = null;
    clock.clearTimeout(pendingCommand.timeout);
    const result: CanvasCommandResult = {
      commandId: acknowledgement.commandId,
      ok: acknowledgement.ok,
      ...(acknowledgement.state === undefined ? {} : { state: acknowledgement.state }),
      ...(acknowledgement.group === undefined ? {} : { group: acknowledgement.group }),
      ...(acknowledgement.error === undefined ? {} : { error: acknowledgement.error }),
    };
    pendingCommand.resolve(result);
    sendJson(response, 202, { commandId: result.commandId, accepted: true }, incomingOrigin);
  };

  const handleDisconnect = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const body = await readJsonBody(request);
    const incomingOrigin = requireBrowserRequest(request, new URL("http://bridge.invalid"), body.sessionToken);
    disconnectBrowser(body.sessionToken as string);
    sendJson(response, 200, { disconnected: true }, incomingOrigin);
  };

  const requireAgentControl = (request: IncomingMessage, bodyAgentId?: unknown): string | null => {
    if (!agentControlToken || !loopbackAddress(request.socket.remoteAddress)) {
      throw new BridgeRequestError(403, "agent_control_unavailable", "Private agent control is unavailable.");
    }
    if (headerValue(request, "authorization") !== `Bearer ${agentControlToken}`) {
      throw new BridgeRequestError(401, "invalid_agent_credential", "The agent control credential is invalid.");
    }
    if (bodyAgentId === undefined) return null;
    if (typeof bodyAgentId !== "string" || bodyAgentId.length === 0 || bodyAgentId.length > 256) {
      throw new BridgeRequestError(400, "invalid_agent_id", "agentId must be a bounded non-empty string.");
    }
    return bodyAgentId;
  };

  const requireAgentOwner = (request: IncomingMessage, body: Record<string, unknown>): string => {
    const agentId = requireAgentControl(request, body.agentId);
    if (!agentId || agentOwner !== agentId) {
      throw new BridgeRequestError(409, "agent_not_owner", "This MCP adapter does not own the project session.");
    }
    agentOwnerSeenAt = clock.now();
    scheduleAgentOwnerExpiry();
    return agentId;
  };

  const releaseAgentOwner = (reason: string): void => {
    if (agentOwnerExpiry !== null) clock.clearTimeout(agentOwnerExpiry);
    agentOwnerExpiry = null;
    agentOwner = null;
    agentOwnerSeenAt = 0;
    cancelListener(reason);
    if (currentRequest?.status === "working") {
      currentRequest = { ...currentRequest, status: "interrupted", error: reason };
      broadcastStatus();
    }
    if (pendingCanvas) {
      const pendingCommand = pendingCanvas;
      pendingCanvas = null;
      clock.clearTimeout(pendingCommand.timeout);
      pendingCommand.resolve({
        commandId: pendingCommand.command.commandId,
        ok: false,
        error: { code: "agent_released", message: reason },
      });
    }
  };

  const scheduleAgentOwnerExpiry = (): void => {
    if (agentOwnerExpiry !== null) clock.clearTimeout(agentOwnerExpiry);
    const expectedOwner = agentOwner;
    if (!expectedOwner) {
      agentOwnerExpiry = null;
      return;
    }
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

  const handleAgentClaim = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const body = await readJsonBody(request);
    const agentId = requireAgentControl(request, body.agentId);
    if (!agentId) throw new BridgeRequestError(400, "invalid_agent_id", "agentId is required.");
    if (agentOwner && agentOwner !== agentId && clock.now() - agentOwnerSeenAt <= AGENT_CLAIM_TIMEOUT_MS) {
      throw new BridgeRequestError(409, "session_claimed", "Another MCP adapter owns this project session.");
    }
    if (agentOwner && agentOwner !== agentId) releaseAgentOwner("The previous MCP adapter claim expired.");
    agentOwner = agentId;
    agentOwnerSeenAt = clock.now();
    scheduleAgentOwnerExpiry();
    sendJson(response, 200, { claimed: true }, null);
  };

  const handleAgentRelease = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const body = await readJsonBody(request);
    const agentId = requireAgentOwner(request, body);
    releaseAgentOwner(`Agent ${agentId} released the project session.`);
    sendJson(response, 200, { released: true }, null);
  };

  const handleAgentListen = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const body = await readJsonBody(request);
    requireAgentOwner(request, body);
    const abort = new AbortController();
    response.once("close", () => abort.abort());
    const prompt = await waitForPrompt(abort.signal);
    sendJson(response, 200, prompt, null);
  };

  const handleAgentReportStatus = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const body = await readJsonBody(request);
    requireAgentOwner(request, body);
    if (!isAgentStatusUpdate(body.update)) {
      throw new BridgeRequestError(400, "invalid_status", "update must be a valid agent status update.");
    }
    updateRequestStatus(body.update);
    sendJson(response, 200, getStatus(), null);
  };

  const handleAgentCanvas = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const body = await readJsonBody(request);
    requireAgentOwner(request, body);
    if (!isCanvasCommand(body.command)) {
      throw new BridgeRequestError(400, "invalid_canvas_command", "command must be a valid Canvas command.");
    }
    sendJson(response, 200, await dispatchCanvasCommand(body.command), null);
  };

  const httpServer = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", `http://${host}:${port}`);
      if (request.method === "GET" && url.pathname === AGENT_CONTROL_ENDPOINTS.health) {
        requireAgentControl(request);
        sendJson(response, 200, { projectId: options.projectId, available: true, claimed: agentOwner !== null, status: getStatus() }, null);
        return;
      }
      if (request.method === "POST" && url.pathname === AGENT_CONTROL_ENDPOINTS.claim) {
        await handleAgentClaim(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === AGENT_CONTROL_ENDPOINTS.release) {
        await handleAgentRelease(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === AGENT_CONTROL_ENDPOINTS.heartbeat) {
        const body = await readJsonBody(request);
        requireAgentOwner(request, body);
        sendJson(response, 200, { alive: true }, null);
        return;
      }
      if (request.method === "POST" && url.pathname === AGENT_CONTROL_ENDPOINTS.listen) {
        await handleAgentListen(request, response);
        return;
      }
      if (request.method === "GET" && url.pathname === AGENT_CONTROL_ENDPOINTS.status) {
        const agentId = url.searchParams.get("agentId");
        requireAgentControl(request, agentId);
        if (agentOwner !== agentId) throw new BridgeRequestError(409, "agent_not_owner", "This MCP adapter does not own the project session.");
        sendJson(response, 200, getStatus(), null);
        return;
      }
      if (request.method === "POST" && url.pathname === AGENT_CONTROL_ENDPOINTS.reportStatus) {
        await handleAgentReportStatus(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === AGENT_CONTROL_ENDPOINTS.canvas) {
        await handleAgentCanvas(request, response);
        return;
      }
      if (request.method === "OPTIONS") {
        handleOptions(request, response);
        return;
      }
      if (request.method === "GET" && url.pathname === BRIDGE_ENDPOINTS.health) {
        handleHealth(request, response, url);
        return;
      }
      if (request.method === "POST" && url.pathname === BRIDGE_ENDPOINTS.pair) {
        await handlePair(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === BRIDGE_ENDPOINTS.takeover) {
        await handleTakeover(request, response);
        return;
      }
      if (request.method === "GET" && url.pathname === BRIDGE_ENDPOINTS.events) {
        handleEvents(request, response, url);
        return;
      }
      if (request.method === "GET" && url.pathname === BRIDGE_ENDPOINTS.status) {
        handleStatus(request, response, url);
        return;
      }
      if (request.method === "POST" && url.pathname === BRIDGE_ENDPOINTS.prompt) {
        await handlePrompt(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === BRIDGE_ENDPOINTS.canvasAcknowledgement) {
        await handleCanvasAcknowledgement(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === BRIDGE_ENDPOINTS.disconnect) {
        await handleDisconnect(request, response);
        return;
      }
      sendJson(response, 404, { error: { code: "not_found", message: "The bridge endpoint does not exist." } }, requestOrigin(request));
    })().catch((error: unknown) => {
      sendError(response, error, requestOrigin(request));
    });
  });

  const start = (): Promise<BridgeAddress> => {
    if (lifecycle === "closed") return Promise.reject(new Error("The browser bridge is closed."));
    if (lifecycle === "listening" && currentAddress) return Promise.resolve(currentAddress);
    if (startPromise) return startPromise;
    startPromise = new Promise<BridgeAddress>((resolveStart, rejectStart) => {
      const onError = (error: Error): void => {
        httpServer.off("listening", onListening);
        startPromise = null;
        rejectStart(error);
      };
      const onListening = (): void => {
        httpServer.off("error", onError);
        const address = httpServer.address();
        if (!address || typeof address === "string") {
          startPromise = null;
          rejectStart(new Error("The browser bridge did not expose a TCP address."));
          return;
        }
        lifecycle = "listening";
        currentAddress = {
          host,
          port: address.port,
          url: `http://${host === "::1" ? `[${host}]` : host}:${address.port}`,
        };
        resolveStart(currentAddress);
      };
      httpServer.once("error", onError);
      httpServer.once("listening", onListening);
      httpServer.listen(port, host);
    });
    return startPromise;
  };

  const cancelListener = (reason = "listener_cancelled"): void => {
    if (!listener) return;
    const pending = listener;
    listener = null;
    if (pending.abortHandler && pending.signal) pending.signal.removeEventListener("abort", pending.abortHandler);
    pending.reject(new BridgeRequestError(409, "listener_cancelled", reason));
    broadcastStatus();
  };

  const waitForPrompt = (signal?: AbortSignal): Promise<AgentDeliveredPrompt> => {
    if (lifecycle === "closed") return Promise.reject(new Error("The browser bridge is closed."));
    if (listener) return Promise.reject(new Error("A listening call is already active for this project."));
    if (currentRequest?.status === "working") return Promise.reject(new Error("A request is already in flight for this project."));
    // Keep the terminal outcome visible until the agent explicitly rearms its
    // listening call. Rearming is the lifecycle boundary for the old request.
    if (currentRequest) currentRequest = null;
    const pendingDeferred = deferred<AgentDeliveredPrompt>();
    const pending: PendingPrompt = {
      resolve: pendingDeferred.resolve,
      reject: pendingDeferred.reject,
      signal,
    };
    if (signal) {
      if (signal.aborted) return Promise.reject(new Error("The listening call was aborted."));
      pending.abortHandler = () => {
        if (listener !== pending) return;
        listener = null;
        pending.reject(new Error("The listening call was aborted."));
        broadcastStatus();
      };
      signal.addEventListener("abort", pending.abortHandler, { once: true });
    }
    listener = pending;
    broadcastStatus();
    if (sessionToken && lastPageUrl && sseClients.size === 0 && options.onControllerUnavailable) {
      void Promise.resolve(options.onControllerUnavailable(lastPageUrl)).catch(() => undefined);
    }
    return pendingDeferred.promise;
  };

  const updateRequestStatus = (update: AgentStatusUpdate | AgentRequestOutcome): void => {
    if (!isAgentStatusUpdate(update)) throw new TypeError("Invalid agent status update");
    if (!currentRequest || currentRequest.requestId !== update.requestId) {
      throw new BridgeRequestError(409, "unknown_request", "The request is not in flight for this project.");
    }
    if (update.status === "working") {
      currentRequest = { ...currentRequest, status: "working" };
    } else {
      currentRequest = {
        ...currentRequest,
        status: update.status,
        ...(update.summary === undefined ? {} : { summary: update.summary }),
        ...(update.error === undefined ? {} : { error: update.error }),
      };
    }
    broadcastStatus();
  };

  const dispatchCanvasCommand = (
    input: CanvasCommandInput,
  ): Promise<CanvasCommandResult> => {
    if (lifecycle === "closed") return Promise.reject(new Error("The browser bridge is closed."));
    if (!sessionToken) return Promise.reject(new Error("No browser is paired with this project."));
    if (pendingCanvas) return Promise.reject(new Error("A Canvas command is already in flight."));
    const command = { ...input, commandId: input.commandId ?? idFactory() } as CanvasCommand;
    if (!isCanvasCommand(command)) return Promise.reject(new TypeError("Invalid Canvas command"));
    // The browser performs the final route check too, but rejecting here keeps
    // the agent side from dispatching a cross-origin URL into the project.
    const routeOrigin = pairedOrigin ?? configuredOrigin;
    if (command.type === "present-routes" && !routeOrigin) {
      return Promise.reject(new Error("Canvas routes require a paired browser origin"));
    }
    if (command.type === "present-routes" && command.routes.some((route) => !isSameOriginRoute(route, routeOrigin!))) {
      return Promise.reject(new TypeError("Canvas routes must belong to the paired project origin"));
    }
    if (command.type === "present-routes") {
      try {
        validateRoutes(command.routes, routeOrigin!);
      } catch (error) {
        return Promise.reject(error);
      }
    }
    const pendingDeferred = deferred<CanvasCommandResult>();
    const timeout = clock.setTimeout(() => {
      if (!pendingCanvas || pendingCanvas.command.commandId !== command.commandId) return;
      pendingCanvas = null;
      pendingDeferred.resolve({
        commandId: command.commandId,
        ok: false,
        error: { code: "ack_timeout", message: "The browser did not acknowledge the Canvas command in time." },
      });
    }, timeoutMs);
    pendingCanvas = { command, resolve: pendingDeferred.resolve, timeout };
    const event: BridgeCanvasCommandEvent = { type: "canvas-command", command };
    broadcast(event);
    return pendingDeferred.promise;
  };

  const pairBrowser = (projectId: string, requestOriginValue: string, pageUrl?: string): PairingResponse => {
    if (projectId !== options.projectId) throw new Error("Project identity does not match this bridge");
    const requestCanonicalOrigin = canonicalOrigin(requestOriginValue);
    if (!requestCanonicalOrigin) throw new Error("Browser origin does not match this bridge");
    // This method is the explicit host-side approval path. A bridge without
    // an HTTP allow-list can still be paired by trusted host code, while all
    // browser-originated requests remain closed until that approval exists.
    if (canonicalAllowedOrigins.length > 0 && !originIsAllowed(requestCanonicalOrigin)) {
      throw new Error("Browser origin is not in the configured allow-list");
    }
    let requestedPageUrl: string | undefined;
    if (pageUrl !== undefined) {
      if (!isSameOriginRoute({ url: pageUrl }, requestCanonicalOrigin)) {
        throw new Error("Browser page URL does not match this bridge");
      }
      requestedPageUrl = new URL(pageUrl, requestCanonicalOrigin).href;
    }
    if (sessionToken) throw new Error("A browser is already paired with this project");
    const nextSessionToken = tokenFactory();
    if (!nextSessionToken || nextSessionToken.length > AGENT_PROTOCOL_LIMITS.sessionToken) {
      throw new Error("tokenFactory returned an invalid session token");
    }
    sessionToken = nextSessionToken;
    pairedOrigin = requestCanonicalOrigin;
    lastPageUrl = requestedPageUrl ?? null;
    const result: PairingResponse = {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      projectId: options.projectId,
      origin: requestCanonicalOrigin,
      sessionToken,
      ...(lastPageUrl === null ? {} : { pageUrl: lastPageUrl }),
      status: getStatus(),
    };
    broadcast({ type: "connected", status: getStatus() });
    broadcastStatus();
    return result;
  };

  const disconnectBrowser = (token: string): void => {
    parseToken(token, sessionToken);
    if (currentRequest?.status === "working") {
      currentRequest = {
        ...currentRequest,
        status: "interrupted",
        error: "The paired browser disconnected while the request was in flight.",
      };
      broadcastStatus();
    }
    broadcast({ type: "disconnected", reason: "browser_disconnected" });
    sessionToken = null;
    pairedOrigin = null;
    for (const response of [...sseClients]) response.end();
    sseClients.clear();
    if (pendingCanvas) {
      clock.clearTimeout(pendingCanvas.timeout);
      pendingCanvas.resolve({
        commandId: pendingCanvas.command.commandId,
        ok: false,
        error: { code: "browser_disconnected", message: "The paired browser disconnected before acknowledging the command." },
      });
      pendingCanvas = null;
    }
    lastPageUrl = null;
  };

  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    lifecycle = "closed";
    if (agentOwnerExpiry !== null) clock.clearTimeout(agentOwnerExpiry);
    agentOwnerExpiry = null;
    agentOwner = null;
    agentOwnerSeenAt = 0;
    cancelListener("bridge_closed");
    if (pendingCanvas) {
      clock.clearTimeout(pendingCanvas.timeout);
      pendingCanvas.resolve({
        commandId: pendingCanvas.command.commandId,
        ok: false,
        error: { code: "bridge_closed", message: "The browser bridge closed before acknowledging the command." },
      });
      pendingCanvas = null;
    }
    for (const response of [...sseClients]) response.end();
    sseClients.clear();
    sessionToken = null;
    pairedOrigin = null;
    lastPageUrl = null;
    closePromise = new Promise<void>((resolveClose) => {
      if (!httpServer.listening) {
        resolveClose();
        return;
      }
      httpServer.close(() => resolveClose());
    });
    return closePromise;
  };

  const bridge: BrowserBridge = {
    httpServer,
    projectId: options.projectId,
    origin: configuredOrigin,
    get effectiveOrigin() { return pairedOrigin ?? configuredOrigin; },
    get lifecycle() { return lifecycle; },
    get address() { return currentAddress; },
    get sessionToken() { return sessionToken; },
    get lastPageUrl() { return lastPageUrl; },
    getStatus,
    start,
    close,
    waitForPrompt,
    cancelListener,
    updateRequestStatus,
    dispatchCanvasCommand,
    pairBrowser,
    disconnectBrowser,
  };
  return bridge;
}
