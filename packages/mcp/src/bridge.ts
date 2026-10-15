import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import {
  AGENT_PROTOCOL_LIMITS,
  AGENT_PROTOCOL_VERSION,
  canonicalOrigin,
  isAgentActivity,
  isAgentStatusUpdate,
  isCanvasCommand,
  isCanvasCommandResult,
  validateSketchAttachments,
} from "@nudge-ui/agent-protocol";
import type { AgentSketchAttachment, BridgeEnvelope } from "@nudge-ui/agent-protocol";
import {
  BridgeSessionError,
  createBridgeSession,
  type BridgeClock,
  type BridgeSessionControls,
  type BridgeSessionErrorCode,
  type BrowserGrant,
  type PromptDispatchInput,
} from "./bridgeSession.ts";
import { AGENT_CONTROL_ENDPOINTS, BRIDGE_ENDPOINTS, type BridgeHttpError } from "./protocol.ts";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const MAX_BODY_BYTES = 256 * 1024;
const MAX_PROMPT_BODY_BYTES = 12 * 1024 * 1024;

const SESSION_ERROR_STATUS = {
  project_not_found: 404,
  origin_not_allowed: 403,
  origin_mismatch: 403,
  invalid_session: 401,
  invalid_page_url: 400,
  invalid_status: 400,
  invalid_activity: 400,
  invalid_canvas_command: 400,
  invalid_routes: 400,
  already_paired: 409,
  browser_unpaired: 409,
  listener_active: 409,
  listener_unavailable: 409,
  listener_cancelled: 409,
  listener_aborted: 409,
  request_in_flight: 409,
  unknown_request: 409,
  inactive_request: 409,
  command_in_flight: 409,
  no_command: 409,
  unknown_command: 409,
  session_claimed: 409,
  agent_not_owner: 409,
  session_closed: 409,
} satisfies Readonly<Record<BridgeSessionErrorCode, number>>;

export interface BrowserBridgeOptions {
  readonly projectId: string;
  /** Canonical app origin that pairing and Canvas routes must use. */
  readonly origin: string;
  /** Other explicit browser origins, such as loopback aliases on the same port. */
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
}

export interface BridgeAddress {
  readonly host: string;
  readonly port: number;
  readonly url: string;
}

export interface BrowserBridge extends BridgeSessionControls {
  readonly projectId: string;
  readonly address: BridgeAddress | null;
  start(): Promise<BridgeAddress>;
  close(): Promise<void>;
}

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

type JsonBody = Record<string, unknown>;
type RouteHandler = (request: IncomingMessage, response: ServerResponse, url: URL) => Promise<void> | void;
type Route = readonly [key: string, handler: RouteHandler];

function route(method: "GET" | "POST", path: string, handler: RouteHandler): Route {
  return [`${method} ${path}`, handler];
}

function loopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return LOOPBACK_HOSTS.has(address) || address === "::ffff:127.0.0.1";
}

function requireLoopback(request: IncomingMessage, code: string, message: string): void {
  if (!loopbackAddress(request.socket.remoteAddress)) throw new BridgeRequestError(403, code, message);
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

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function setCors(response: ServerResponse, origin: string): void {
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Vary", "Origin");
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown, origin: string | null): void {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (origin) setCors(response, origin);
  response.statusCode = statusCode;
  response.end(JSON.stringify(body));
}

interface ErrorReply {
  readonly statusCode: number;
  readonly body: BridgeHttpError;
}

function errorResponse(error: unknown): ErrorReply {
  if (error instanceof BridgeRequestError) {
    return { statusCode: error.statusCode, body: { error: { code: error.code, message: error.message } } };
  }
  if (error instanceof BridgeSessionError) {
    return { statusCode: SESSION_ERROR_STATUS[error.code], body: { error: { code: error.code, message: error.message } } };
  }
  return { statusCode: 500, body: { error: { code: "internal_error", message: "The bridge could not complete the request." } } };
}

async function readJsonBody(request: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<JsonBody> {
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
  return parsed as JsonBody;
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

function decodeSketchAttachments(value: unknown): AgentSketchAttachment[] {
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

function decodePromptDispatch(body: JsonBody): PromptDispatchInput {
  const { prompt, changeRevision, clientDispatchId } = body;
  if (typeof prompt !== "string" || prompt.length === 0 || prompt.length > AGENT_PROTOCOL_LIMITS.prompt) {
    throw new BridgeRequestError(400, "invalid_prompt", "prompt must be a bounded non-empty string");
  }
  if (changeRevision !== undefined && (typeof changeRevision !== "number" || !Number.isSafeInteger(changeRevision) || changeRevision < 0)) {
    throw new BridgeRequestError(400, "invalid_revision", "changeRevision must be a non-negative safe integer");
  }
  if (clientDispatchId !== undefined && (typeof clientDispatchId !== "string"
    || clientDispatchId.length === 0 || clientDispatchId.length > AGENT_PROTOCOL_LIMITS.clientDispatchId)) {
    throw new BridgeRequestError(400, "invalid_dispatch_id", "clientDispatchId must be a bounded non-empty string");
  }
  return {
    prompt,
    ...(changeRevision === undefined ? {} : { changeRevision }),
    ...(clientDispatchId === undefined ? {} : { clientDispatchId }),
    attachments: decodeSketchAttachments(body.attachments),
  };
}

function decodeAgentId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new BridgeRequestError(400, "invalid_agent_id", "agentId must be a bounded non-empty string.");
  }
  return value;
}

function writeSse(response: ServerResponse, envelope: BridgeEnvelope): boolean {
  if (response.destroyed || response.writableEnded) return false;
  try {
    response.write(`event: ${envelope.event.type}\ndata: ${JSON.stringify(envelope)}\n\n`);
    return true;
  } catch {
    response.destroy();
    return false;
  }
}

/** Binds only to loopback and keeps every pairing, prompt, command, and acknowledgement in process memory. */
export function createLoopbackBridge(options: BrowserBridgeOptions): BrowserBridge {
  const host = options.host ?? "127.0.0.1";
  if (!LOOPBACK_HOSTS.has(host)) throw new TypeError("The browser bridge must bind to a loopback host");
  const port = options.port ?? 0;
  if (!validPort(port)) throw new TypeError("port must be between 0 and 65535");
  const { agentControlToken } = options;
  if (agentControlToken !== undefined && (agentControlToken.length < 32 || agentControlToken.length > 256)) {
    throw new TypeError("agentControlToken must contain between 32 and 256 characters");
  }
  const session = createBridgeSession({
    projectId: options.projectId,
    origin: options.origin,
    allowedOrigins: options.allowedOrigins,
    commandTimeoutMs: options.commandTimeoutMs,
    clock: options.clock,
    tokenFactory: options.tokenFactory ?? (() => randomBytes(32).toString("base64url")),
    idFactory: options.idFactory ?? randomUUID,
  });

  const browserOrigin = (request: IncomingMessage): string => {
    requireLoopback(request, "loopback_only", "The browser bridge accepts loopback connections only.");
    return session.authorizeOrigin(requestOrigin(request));
  };

  const pairedBrowser = (request: IncomingMessage, sessionToken: string | null | undefined): BrowserGrant => {
    requireLoopback(request, "loopback_only", "The browser bridge accepts loopback connections only.");
    return session.authorizeBrowser(requestOrigin(request), sessionToken);
  };

  const readPairRequest = async (request: IncomingMessage): Promise<{ origin: string; pageUrl?: string; body: JsonBody }> => {
    const origin = browserOrigin(request);
    const body = await readJsonBody(request);
    session.assertProject(body.projectId);
    if (canonicalOrigin(body.origin) !== origin) {
      throw new BridgeRequestError(403, "origin_mismatch", "Pairing requires an explicitly configured project origin.");
    }
    if (body.pageUrl !== undefined && typeof body.pageUrl !== "string") {
      throw new BridgeRequestError(400, "invalid_page_url", "pageUrl must be a bounded same-origin URL.");
    }
    return { origin, ...(body.pageUrl === undefined ? {} : { pageUrl: body.pageUrl }), body };
  };

  const requireAgentControl = (request: IncomingMessage): void => {
    if (!agentControlToken) {
      throw new BridgeRequestError(403, "agent_control_unavailable", "Private agent control is unavailable.");
    }
    requireLoopback(request, "agent_control_unavailable", "Private agent control is unavailable.");
    if (headerValue(request, "authorization") !== `Bearer ${agentControlToken}`) {
      throw new BridgeRequestError(401, "invalid_agent_credential", "The agent control credential is invalid.");
    }
  };

  /** Authenticates the adapter before reading its body, then confirms it owns the session. */
  const readAgentRequest = async (request: IncomingMessage): Promise<JsonBody> => {
    requireAgentControl(request);
    const body = await readJsonBody(request);
    session.confirmAgent(decodeAgentId(body.agentId));
    return body;
  };

  const routes = new Map([
    route("GET", BRIDGE_ENDPOINTS.health, (request, response, url) => {
      const origin = browserOrigin(request);
      session.assertProject(url.searchParams.get("projectId"));
      const status = session.getStatus();
      sendJson(response, 200, {
        protocolVersion: AGENT_PROTOCOL_VERSION,
        projectId: session.projectId,
        origin,
        status,
        sessionRequired: true,
        pageUrl: status.pageUrl ?? null,
      }, origin);
    }),
    route("POST", BRIDGE_ENDPOINTS.pair, async (request, response) => {
      const { origin, pageUrl, body } = await readPairRequest(request);
      sendJson(response, 200, session.pairBrowser(origin, pageUrl, optionalString(body.sessionToken)), origin);
    }),
    route("POST", BRIDGE_ENDPOINTS.takeover, async (request, response) => {
      const { origin, pageUrl } = await readPairRequest(request);
      sendJson(response, 200, session.takeOver(origin, pageUrl), origin);
    }),
    route("GET", BRIDGE_ENDPOINTS.events, (request, response, url) => {
      session.assertProject(url.searchParams.get("projectId"));
      const { origin } = pairedBrowser(request, url.searchParams.get("sessionToken"));
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Cache-Control", "no-cache, no-store");
      response.setHeader("Connection", "keep-alive");
      response.setHeader("X-Accel-Buffering", "no");
      setCors(response, origin);
      response.flushHeaders();
      const detach = session.attachStream({
        send: (envelope) => writeSse(response, envelope),
        end: () => response.end(),
      });
      request.once("close", detach);
      response.once("close", detach);
    }),
    route("GET", BRIDGE_ENDPOINTS.status, (request, response, url) => {
      session.assertProject(url.searchParams.get("projectId"));
      const { origin } = pairedBrowser(request, url.searchParams.get("sessionToken"));
      sendJson(response, 200, session.getStatus(), origin);
    }),
    route("POST", BRIDGE_ENDPOINTS.prompt, async (request, response) => {
      const body = await readJsonBody(request, MAX_PROMPT_BODY_BYTES);
      const { origin } = pairedBrowser(request, optionalString(body.sessionToken));
      session.assertProject(body.projectId);
      sendJson(response, 202, session.dispatchPrompt(decodePromptDispatch(body)), origin);
    }),
    route("POST", BRIDGE_ENDPOINTS.canvasAcknowledgement, async (request, response) => {
      const body = await readJsonBody(request);
      const { origin } = pairedBrowser(request, optionalString(body.sessionToken));
      session.assertProject(body.projectId);
      // Acknowledgement payloads flow back to the agent verbatim.
      const { projectId: _projectId, sessionToken: _sessionToken, ...result } = body;
      if (!isCanvasCommandResult(result)) {
        throw new BridgeRequestError(400, "invalid_acknowledgement", "The acknowledgement is not a valid Canvas command result.");
      }
      session.acknowledgeCanvas(result);
      sendJson(response, 202, { commandId: result.commandId, accepted: true }, origin);
    }),
    route("POST", BRIDGE_ENDPOINTS.disconnect, async (request, response) => {
      const body = await readJsonBody(request);
      const grant = pairedBrowser(request, optionalString(body.sessionToken));
      session.disconnectBrowser(grant.sessionToken);
      sendJson(response, 200, { disconnected: true }, grant.origin);
    }),
    route("GET", AGENT_CONTROL_ENDPOINTS.health, (request, response) => {
      requireAgentControl(request);
      sendJson(response, 200, {
        projectId: session.projectId,
        available: true,
        claimed: session.agentClaimed,
        status: session.getStatus(),
      }, null);
    }),
    route("POST", AGENT_CONTROL_ENDPOINTS.claim, async (request, response) => {
      requireAgentControl(request);
      const agentId = decodeAgentId((await readJsonBody(request)).agentId);
      if (!agentId) throw new BridgeRequestError(400, "invalid_agent_id", "agentId is required.");
      session.claimAgent(agentId);
      sendJson(response, 200, { claimed: true }, null);
    }),
    route("POST", AGENT_CONTROL_ENDPOINTS.release, async (request, response) => {
      requireAgentControl(request);
      session.releaseAgent(decodeAgentId((await readJsonBody(request)).agentId));
      sendJson(response, 200, { released: true }, null);
    }),
    route("POST", AGENT_CONTROL_ENDPOINTS.heartbeat, async (request, response) => {
      await readAgentRequest(request);
      sendJson(response, 200, { alive: true }, null);
    }),
    route("POST", AGENT_CONTROL_ENDPOINTS.request, async (request, response) => {
      const body = await readAgentRequest(request);
      if (typeof body.requestId !== "string" || !body.requestId || body.requestId.length > AGENT_PROTOCOL_LIMITS.requestId) {
        throw new BridgeRequestError(400, "invalid_request_id", "requestId must be a bounded non-empty string.");
      }
      sendJson(response, 200, session.getRequest(body.requestId), null);
    }),
    route("POST", AGENT_CONTROL_ENDPOINTS.listen, async (request, response) => {
      const body = await readAgentRequest(request);
      const abort = new AbortController();
      response.once("close", () => abort.abort());
      const prompt = await session.waitForPrompt({
        signal: abort.signal,
        agentClientName: optionalString(body.agentClientName),
      });
      sendJson(response, 200, prompt, null);
    }),
    route("GET", AGENT_CONTROL_ENDPOINTS.status, (request, response, url) => {
      requireAgentControl(request);
      session.confirmAgent(decodeAgentId(url.searchParams.get("agentId")));
      sendJson(response, 200, session.getStatus(), null);
    }),
    route("POST", AGENT_CONTROL_ENDPOINTS.reportStatus, async (request, response) => {
      const { update } = await readAgentRequest(request);
      if (!isAgentStatusUpdate(update)) {
        throw new BridgeRequestError(400, "invalid_status", "update must be a valid agent status update.");
      }
      session.updateRequestStatus(update);
      sendJson(response, 200, session.getStatus(), null);
    }),
    route("POST", AGENT_CONTROL_ENDPOINTS.activity, async (request, response) => {
      const { activity } = await readAgentRequest(request);
      if (!isAgentActivity(activity)) {
        throw new BridgeRequestError(400, "invalid_activity", "activity must identify a workspace-relative source file.");
      }
      session.reportActivity(activity);
      sendJson(response, 200, { accepted: true }, null);
    }),
    route("POST", AGENT_CONTROL_ENDPOINTS.canvas, async (request, response) => {
      const { command } = await readAgentRequest(request);
      if (!isCanvasCommand(command)) {
        throw new BridgeRequestError(400, "invalid_canvas_command", "command must be a valid Canvas command.");
      }
      sendJson(response, 200, await session.dispatchCanvasCommand(command), null);
    }),
  ]);

  const handleOptions = (request: IncomingMessage, response: ServerResponse): void => {
    const origin = requestOrigin(request);
    if (origin) {
      try {
        session.authorizeOrigin(origin);
      } catch (error) {
        const { statusCode, body } = errorResponse(error);
        sendJson(response, statusCode, body, null);
        return;
      }
      setCors(response, origin);
    }
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.statusCode = 204;
    response.end();
  };

  const httpServer = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", `http://${host}:${port}`);
      if (request.method === "OPTIONS") {
        handleOptions(request, response);
        return;
      }
      const handler = routes.get(`${request.method ?? ""} ${url.pathname}`);
      if (!handler) {
        sendJson(response, 404, { error: { code: "not_found", message: "The bridge endpoint does not exist." } }, requestOrigin(request));
        return;
      }
      await handler(request, response, url);
    })().catch((error: unknown) => {
      const { statusCode, body } = errorResponse(error);
      sendJson(response, statusCode, body, requestOrigin(request));
    });
  });

  let closed = false;
  let currentAddress: BridgeAddress | null = null;
  let startPromise: Promise<BridgeAddress> | null = null;
  let closePromise: Promise<void> | null = null;

  const start = (): Promise<BridgeAddress> => {
    if (closed) return Promise.reject(new Error("The browser bridge is closed."));
    if (currentAddress) return Promise.resolve(currentAddress);
    startPromise ??= new Promise<BridgeAddress>((resolveStart, rejectStart) => {
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

  const close = (): Promise<void> => {
    closed = true;
    session.close();
    closePromise ??= new Promise<void>((resolveClose) => {
      if (!httpServer.listening) {
        resolveClose();
        return;
      }
      httpServer.close(() => resolveClose());
    });
    return closePromise;
  };

  return {
    projectId: session.projectId,
    get address() { return currentAddress; },
    start,
    close,
    getStatus: session.getStatus,
    getRequest: session.getRequest,
    pairBrowser: (origin, pageUrl) => session.pairBrowser(origin, pageUrl),
    disconnectBrowser: session.disconnectBrowser,
    waitForPrompt: session.waitForPrompt,
    updateRequestStatus: session.updateRequestStatus,
    reportActivity: session.reportActivity,
    dispatchCanvasCommand: session.dispatchCanvasCommand,
  };
}
