import {
  AGENT_PROTOCOL_VERSION,
  defaultBridgePort,
  type AgentBridgeTransport,
  type AgentBridgeEndpointConfig,
  type AgentBridgeEvent,
  type AgentDiscoveryRequest,
  type AgentEventHandlers,
  type AgentEventSubscription,
  type AgentEventsRequest,
  type AgentPairRequest,
  type AgentPromptDispatch,
  type AgentDisconnectRequest,
  type AgentCanvasAcknowledgementRequest,
  type AgentSessionRequest,
  type AgentStatusSnapshot,
  type PairingResponse,
  type PromptDispatchResponse,
  type BridgeEnvelope,
  type CanvasCommand,
  isAgentPromptRequest,
} from "./protocol.ts";
import { getActiveCanvasDocument } from "../canvas/activeCanvasDocument.ts";

interface AgentWindow extends Window {
  __NUDGE_UI_AGENT_BRIDGE__?: AgentBridgeEndpointConfig;
  __NUDGE_UI_AGENT__?: AgentBridgeEndpointConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function endpointValue(value: unknown): AgentBridgeEndpointConfig | undefined {
  if (!isRecord(value)) return undefined;
  const config: AgentBridgeEndpointConfig = {
    baseUrl: stringValue(value.baseUrl),
    healthUrl: stringValue(value.healthUrl),
    pairUrl: stringValue(value.pairUrl),
    eventsUrl: stringValue(value.eventsUrl),
    promptUrl: stringValue(value.promptUrl),
    statusUrl: stringValue(value.statusUrl),
    canvasAckUrl: stringValue(value.canvasAckUrl),
    disconnectUrl: stringValue(value.disconnectUrl),
    takeoverUrl: stringValue(value.takeoverUrl),
    ...(value.autoConnect === true ? { autoConnect: true } : {}),
  };
  return Object.values(config).some((entry) => entry !== undefined) ? config : undefined;
}

function configuredEndpointInDocument(doc: Document): AgentBridgeEndpointConfig | undefined {
  const target = doc.defaultView as AgentWindow | null;
  if (!target) return undefined;
  const globalConfig = endpointValue(target.__NUDGE_UI_AGENT_BRIDGE__)
    ?? endpointValue(target.__NUDGE_UI_AGENT__);
  if (globalConfig) return globalConfig;
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="nudge-ui-agent-bridge"]');
  const content = meta?.content.trim();
  return content ? { baseUrl: content } : undefined;
}

function configuredEndpoint(): AgentBridgeEndpointConfig | undefined {
  if (typeof document === "undefined") return undefined;
  const controllerConfig = configuredEndpointInDocument(document);
  if (controllerConfig) return controllerConfig;
  const previewDocument = getActiveCanvasDocument();
  return previewDocument ? configuredEndpointInDocument(previewDocument) : undefined;
}

/** Returns whether the dev host supplied a trusted project bridge endpoint. */
export function shouldAutoConnectAgentBridge(): boolean {
  return configuredEndpoint()?.autoConnect === true;
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "[::1]"
    || normalized === "::1";
}

function pageOrigin(): string {
  return typeof window !== "undefined" && window.location.origin
    ? window.location.origin
    : "http://localhost";
}

function safeUrl(value: string, origin: string): URL | null {
  try {
    const url = new URL(value, origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // A same-origin reverse proxy is valid; a separately hosted bridge must
    // remain loopback-only to match ADR-0013.
    if (url.origin !== origin && !isLoopback(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function endpointUrl(
  config: AgentBridgeEndpointConfig,
  projectId: string,
  key: Exclude<keyof AgentBridgeEndpointConfig, "autoConnect">,
  fallbackPath: string,
  origin: string,
): URL | null {
  const explicit = config[key];
  if (explicit && key !== "baseUrl") return safeUrl(explicit, origin);
  const baseValue = config.baseUrl ?? `http://127.0.0.1:${defaultBridgePort(projectId)}`;
  const base = safeUrl(baseValue, origin);
  if (!base) return null;
  base.pathname = `${base.pathname.replace(/\/$/, "")}${fallbackPath}`;
  return base;
}

function withQuery(url: URL, values: Record<string, string>): URL {
  const result = new URL(url.href);
  for (const [key, value] of Object.entries(values)) result.searchParams.set(key, value);
  return result;
}

function headers(): HeadersInit {
  return {
    Accept: "application/json",
  };
}

export class AgentBridgeHttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "AgentBridgeHttpError";
    this.status = status;
    this.code = code;
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : payload;
    const message = isRecord(error) ? stringValue(error.message) : undefined;
    const code = isRecord(error) ? stringValue(error.code) : undefined;
    throw new AgentBridgeHttpError(
      response.status,
      message ?? `Agent bridge request failed (${response.status}).`,
      code,
    );
  }
  return isRecord(payload) ? payload : {};
}

function statusPayload(value: unknown): AgentStatusSnapshot | null {
  if (!isRecord(value)) return null;
  const status = isRecord(value.status) ? value.status : value;
  if (typeof status.projectId !== "string"
    || (status.connection !== "offline"
      && status.connection !== "listening"
      && status.connection !== "paired"
      && status.connection !== "working")
    || typeof status.listenerActive !== "boolean"
    || typeof status.paired !== "boolean") return null;
  if (status.protocolVersion !== undefined && status.protocolVersion !== AGENT_PROTOCOL_VERSION) return null;
  const rawRequest = status.request;
  let request: AgentStatusSnapshot["request"] = null;
  if (rawRequest !== null && rawRequest !== undefined) {
    if (!isRecord(rawRequest)
      || (rawRequest.status !== "working"
        && rawRequest.status !== "completed"
        && rawRequest.status !== "failed"
        && rawRequest.status !== "interrupted")) return null;
    const requestCandidate: Record<string, unknown> = {
      requestId: rawRequest.requestId,
      projectId: rawRequest.projectId,
      prompt: rawRequest.prompt,
      ...(typeof rawRequest.changeRevision === "number" ? { changeRevision: rawRequest.changeRevision } : {}),
      ...(rawRequest.clientDispatchId === undefined ? {} : { clientDispatchId: rawRequest.clientDispatchId }),
      ...(rawRequest.sketches === undefined ? {} : { sketches: rawRequest.sketches }),
    };
    if (!isAgentPromptRequest(requestCandidate)) return null;
    request = {
      ...requestCandidate,
      status: rawRequest.status,
      ...(typeof rawRequest.summary === "string" ? { summary: rawRequest.summary } : {}),
      ...(typeof rawRequest.error === "string" ? { error: rawRequest.error } : {}),
    };
  }
  return {
    protocolVersion: AGENT_PROTOCOL_VERSION,
    projectId: status.projectId,
    connection: status.connection,
    listenerActive: status.listenerActive,
    paired: status.paired,
    request,
  };
}

function eventPayload(value: unknown): AgentBridgeEvent | null {
  if (!isRecord(value)) return null;
  const envelope = value as Partial<BridgeEnvelope>;
  const event = isRecord(envelope.event) ? envelope.event : value;
  const type = stringValue(event.type);
  if (type === "status") {
    const status = statusPayload(event.status);
    return status ? { type: "status", status } : null;
  }
  if (type === "connected") {
    const status = statusPayload(event.status);
    return status ? { type: "connected", status } : null;
  }
  if (type === "disconnected") {
    return { type: "disconnected", ...(stringValue(event.reason) ? { reason: stringValue(event.reason) } : {}) };
  }
  if (type === "canvas-command" && isRecord(event.command)) {
    // The Canvas controller owns command validation. Preserve the shared
    // shape here so the parent stage can consume this event without a second
    // protocol vocabulary.
    return { type: "canvas-command", command: event.command as unknown as CanvasCommand };
  }
  return null;
}

function eventData(event: MessageEvent<unknown>): unknown {
  if (typeof event.data !== "string") return event.data;
  try {
    return JSON.parse(event.data) as unknown;
  } catch {
    return null;
  }
}

/**
 * HTTP/SSE browser adapter for the companion's canonical endpoints.
 *
 * The adapter is inert when no endpoint is configured. A host can publish an
 * endpoint with `window.__NUDGE_UI_AGENT_BRIDGE__` or the meta tag named
 * `nudge-ui-agent-bridge`; tests can inject a transport directly instead.
 */
export class HttpAgentBridgeTransport implements AgentBridgeTransport {
  private readonly config: AgentBridgeEndpointConfig;

  constructor(config: AgentBridgeEndpointConfig = configuredEndpoint() ?? {}) {
    this.config = config;
  }

  async discover(request: AgentDiscoveryRequest, signal?: AbortSignal): Promise<AgentStatusSnapshot | null> {
    const url = endpointUrl(this.config, request.projectId, "healthUrl", "/health", pageOrigin());
    if (!url || typeof fetch !== "function") return null;
    const response = await fetch(withQuery(url, {
      projectId: request.projectId,
    }), {
      method: "GET",
      headers: headers(),
      signal,
    });
    const payload = await readJson(response);
    if (payload.protocolVersion !== AGENT_PROTOCOL_VERSION
      || payload.projectId !== request.projectId
      || (payload.origin !== undefined && payload.origin !== null && payload.origin !== request.origin)) return null;
    return statusPayload(payload.status);
  }

  async pair(request: AgentPairRequest, signal?: AbortSignal): Promise<PairingResponse> {
    const url = endpointUrl(this.config, request.projectId, "pairUrl", "/pair", pageOrigin());
    if (!url || typeof fetch !== "function") throw new Error("Agent bridge is unavailable.");
    const response = await fetch(url, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    const payload = await readJson(response);
    if (payload.protocolVersion !== AGENT_PROTOCOL_VERSION
      || payload.projectId !== request.projectId
      || payload.origin !== request.origin
      || typeof payload.sessionToken !== "string") {
      throw new Error("Agent bridge returned an invalid pairing response.");
    }
    const status = statusPayload(payload.status);
    if (!status) throw new Error("Agent bridge returned an invalid status.");
    return {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      projectId: request.projectId,
      origin: request.origin,
      sessionToken: payload.sessionToken,
      status,
    };
  }

  async takeOver(request: AgentPairRequest, signal?: AbortSignal): Promise<PairingResponse> {
    const url = endpointUrl(this.config, request.projectId, "takeoverUrl", "/takeover", pageOrigin());
    if (!url || typeof fetch !== "function") throw new Error("Agent bridge is unavailable.");
    const response = await fetch(url, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    const payload = await readJson(response);
    if (payload.protocolVersion !== AGENT_PROTOCOL_VERSION
      || payload.projectId !== request.projectId
      || payload.origin !== request.origin
      || typeof payload.sessionToken !== "string") {
      throw new Error("Agent bridge returned an invalid takeover response.");
    }
    const status = statusPayload(payload.status);
    if (!status) throw new Error("Agent bridge returned an invalid status.");
    return {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      projectId: request.projectId,
      origin: request.origin,
      sessionToken: payload.sessionToken,
      status,
    };
  }

  async restore(request: AgentSessionRequest, signal?: AbortSignal): Promise<AgentStatusSnapshot | null> {
    const url = endpointUrl(this.config, request.projectId, "statusUrl", "/status", pageOrigin());
    if (!url || typeof fetch !== "function") return null;
    const response = await fetch(withQuery(url, {
      projectId: request.projectId,
      sessionToken: request.sessionToken,
    }), { method: "GET", headers: headers(), signal });
    const payload = await readJson(response);
    if (payload.protocolVersion !== AGENT_PROTOCOL_VERSION || payload.projectId !== request.projectId) return null;
    const status = statusPayload(payload);
    if (!status || !status.paired) return null;
    return status;
  }

  openEvents(request: AgentEventsRequest, handlers: AgentEventHandlers): AgentEventSubscription {
    const url = endpointUrl(this.config, request.projectId, "eventsUrl", "/events", pageOrigin());
    if (!url || typeof EventSource !== "function") {
      queueMicrotask(() => handlers.onDisconnect("Agent event transport is unavailable."));
      return { close: () => undefined };
    }
    const eventUrl = withQuery(url, {
      projectId: request.projectId,
      sessionToken: request.sessionToken,
    });
    const source = new EventSource(eventUrl.href);
    let closed = false;
    const handleMessage = (event: MessageEvent<unknown>): void => {
      const parsed = eventPayload(eventData(event));
      if (parsed) handlers.onEvent(parsed);
    };
    source.addEventListener("message", handleMessage as EventListener);
    source.addEventListener("status", handleMessage as EventListener);
    source.addEventListener("connected", handleMessage as EventListener);
    source.addEventListener("disconnected", handleMessage as EventListener);
    source.addEventListener("canvas-command", handleMessage as EventListener);
    source.onerror = () => {
      if (closed) return;
      closed = true;
      source.close();
      handlers.onDisconnect("Agent event stream disconnected.");
    };
    return {
      close: () => {
        if (closed) return;
        closed = true;
        source.close();
      },
    };
  }

  async dispatch(request: AgentPromptDispatch, signal?: AbortSignal): Promise<PromptDispatchResponse> {
    const url = endpointUrl(this.config, request.projectId, "promptUrl", "/prompt", pageOrigin());
    if (!url || typeof fetch !== "function") throw new Error("Agent bridge is unavailable.");
    const response = await fetch(url, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    const payload = await readJson(response);
    if (!isRecord(payload.request) || payload.status !== "working") {
      throw new Error("Agent bridge returned an invalid prompt response.");
    }
    const requestCandidate: Record<string, unknown> = {
      requestId: payload.request.requestId,
      projectId: payload.request.projectId,
      prompt: payload.request.prompt,
      ...(typeof payload.request.changeRevision === "number" ? { changeRevision: payload.request.changeRevision } : {}),
      ...(payload.request.clientDispatchId === undefined ? {} : { clientDispatchId: payload.request.clientDispatchId }),
      ...(payload.request.sketches === undefined ? {} : { sketches: payload.request.sketches }),
    };
    if (!isAgentPromptRequest(requestCandidate) || requestCandidate.projectId !== request.projectId) {
      throw new Error("Agent bridge returned an invalid prompt response.");
    }
    return { request: requestCandidate, status: "working" };
  }

  async disconnect(request: AgentDisconnectRequest, signal?: AbortSignal): Promise<void> {
    const url = endpointUrl(this.config, request.projectId, "disconnectUrl", "/disconnect", pageOrigin());
    if (!url || typeof fetch !== "function") return;
    await fetch(url, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  }

  async acknowledgeCanvasCommand(
    request: AgentCanvasAcknowledgementRequest,
    signal?: AbortSignal,
  ): Promise<void> {
    const url = endpointUrl(this.config, request.projectId, "canvasAckUrl", "/canvas/ack", pageOrigin());
    if (!url || typeof fetch !== "function") return;
    await fetch(url, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: request.projectId,
        sessionToken: request.sessionToken,
        ...request.acknowledgement,
      }),
      signal,
    });
  }
}

/** Resolve host configuration without touching the network. */
export function getConfiguredAgentBridgeEndpoint(): AgentBridgeEndpointConfig | undefined {
  return configuredEndpoint();
}
