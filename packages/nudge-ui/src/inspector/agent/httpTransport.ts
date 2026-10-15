import {
  AGENT_PROTOCOL_VERSION,
  type AgentBridgeTransport,
  type AgentBridgeEndpointConfig,
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
  decodeAgentStatusSnapshot,
  decodeBridgeEvent,
  decodePairingResponse,
  decodePromptDispatchResponse,
} from "./protocol.ts";
import { getActiveCanvasDocument } from "../canvas/activeCanvasDocument.ts";

interface AgentWindow extends Window {
  __NUDGE_UI_AGENT_BRIDGE__?: AgentBridgeEndpointConfig;
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
  const globalConfig = endpointValue(target.__NUDGE_UI_AGENT_BRIDGE__);
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
    // A separately hosted bridge must remain loopback-only; a same-origin reverse proxy is valid.
    if (url.origin !== origin && !isLoopback(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

/** Null when the host published no endpoint; the browser never guesses a bridge port. */
function endpointUrl(
  config: AgentBridgeEndpointConfig,
  key: Exclude<keyof AgentBridgeEndpointConfig, "autoConnect">,
  fallbackPath: string,
  origin: string,
): URL | null {
  const explicit = config[key];
  if (explicit && key !== "baseUrl") return safeUrl(explicit, origin);
  const base = config.baseUrl ? safeUrl(config.baseUrl, origin) : null;
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
  const body: unknown = await response.json().catch(() => null);
  const payload = isRecord(body) ? body : {};
  if (!response.ok) {
    const error = isRecord(payload.error) ? payload.error : payload;
    const message = isRecord(error) ? stringValue(error.message) : undefined;
    const code = isRecord(error) ? stringValue(error.code) : undefined;
    throw new AgentBridgeHttpError(
      response.status,
      message ?? `Agent bridge request failed (${response.status}).`,
      code,
    );
  }
  return payload;
}

export class HttpAgentBridgeTransport implements AgentBridgeTransport {
  private readonly config: AgentBridgeEndpointConfig;

  constructor(config: AgentBridgeEndpointConfig = configuredEndpoint() ?? {}) {
    this.config = config;
  }

  async discover(request: AgentDiscoveryRequest, signal?: AbortSignal): Promise<AgentStatusSnapshot | null> {
    const url = endpointUrl(this.config, "healthUrl", "/health", pageOrigin());
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
    return decodeAgentStatusSnapshot(payload.status);
  }

  async pair(request: AgentPairRequest, signal?: AbortSignal): Promise<PairingResponse> {
    const url = endpointUrl(this.config, "pairUrl", "/pair", pageOrigin());
    if (!url || typeof fetch !== "function") throw new Error("Agent bridge is unavailable.");
    const response = await fetch(url, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    const pairing = decodePairingResponse(await readJson(response), request);
    if (!pairing) throw new Error("Agent bridge returned an invalid pairing response.");
    return pairing;
  }

  async takeOver(request: AgentPairRequest, signal?: AbortSignal): Promise<PairingResponse> {
    const url = endpointUrl(this.config, "takeoverUrl", "/takeover", pageOrigin());
    if (!url || typeof fetch !== "function") throw new Error("Agent bridge is unavailable.");
    const response = await fetch(url, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    const pairing = decodePairingResponse(await readJson(response), request);
    if (!pairing) throw new Error("Agent bridge returned an invalid takeover response.");
    return pairing;
  }

  async restore(request: AgentSessionRequest, signal?: AbortSignal): Promise<AgentStatusSnapshot | null> {
    const url = endpointUrl(this.config, "statusUrl", "/status", pageOrigin());
    if (!url || typeof fetch !== "function") return null;
    const response = await fetch(withQuery(url, {
      projectId: request.projectId,
      sessionToken: request.sessionToken,
    }), { method: "GET", headers: headers(), signal });
    const status = decodeAgentStatusSnapshot(await readJson(response));
    if (!status || status.projectId !== request.projectId || !status.paired) return null;
    return status;
  }

  openEvents(request: AgentEventsRequest, handlers: AgentEventHandlers): AgentEventSubscription {
    const url = endpointUrl(this.config, "eventsUrl", "/events", pageOrigin());
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
    const handleMessage = (event: MessageEvent<string>): void => {
      let envelope: unknown;
      try {
        envelope = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!isRecord(envelope)
        || envelope.protocolVersion !== AGENT_PROTOCOL_VERSION
        || envelope.projectId !== request.projectId
        || envelope.sessionToken !== request.sessionToken) return;
      const parsed = decodeBridgeEvent(envelope.event);
      if (parsed) handlers.onEvent(parsed);
    };
    source.addEventListener("message", handleMessage as EventListener);
    source.addEventListener("status", handleMessage as EventListener);
    source.addEventListener("connected", handleMessage as EventListener);
    source.addEventListener("disconnected", handleMessage as EventListener);
    source.addEventListener("activity", handleMessage as EventListener);
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
    const url = endpointUrl(this.config, "promptUrl", "/prompt", pageOrigin());
    if (!url || typeof fetch !== "function") throw new Error("Agent bridge is unavailable.");
    const response = await fetch(url, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    const dispatched = decodePromptDispatchResponse(await readJson(response), request.projectId);
    if (!dispatched) throw new Error("Agent bridge returned an invalid prompt response.");
    return dispatched;
  }

  async disconnect(request: AgentDisconnectRequest, signal?: AbortSignal): Promise<void> {
    const url = endpointUrl(this.config, "disconnectUrl", "/disconnect", pageOrigin());
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
    const url = endpointUrl(this.config, "canvasAckUrl", "/canvas/ack", pageOrigin());
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
