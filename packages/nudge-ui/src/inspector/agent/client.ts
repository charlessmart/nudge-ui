import { useEffect, useMemo, useSyncExternalStore } from "react";
import { isNudgeUiDev } from "../runtime/devFlag.ts";
import { isDemoRuntime } from "../runtime/runtimeConfig.ts";
import {
  AgentBridgeHttpError,
  HttpAgentBridgeTransport,
  shouldAutoConnectAgentBridge,
} from "./httpTransport.ts";
import {
  AGENT_PROTOCOL_VERSION,
  type AgentBridgeEvent,
  type AgentBridgeTransport,
  type AgentClientOptions,
  type AgentDiscoveryRequest,
  type AgentDisconnectRequest,
  type AgentSessionRequest,
  type AgentEventsRequest,
  type AgentPairRequest,
  type AgentPromptDispatch,
  type AgentSketchAttachment,
  type AgentSketchMetadata,
  type AgentRequestStatus,
  type AgentStatusSnapshot,
  type CanvasCommand,
  type AgentCanvasAcknowledgementRequest,
  type PairingResponse,
  type PromptDispatchResponse,
} from "./protocol.ts";

export type AgentClientState =
  | "disabled"
  | "disconnected"
  | "available"
  | "pairing"
  | "connected"
  | "working"
  | "completed"
  | "failed"
  | "interrupted";

export interface AgentRequestSnapshot {
  readonly requestId: string;
  readonly changeRevision?: number;
  readonly clientDispatchId?: string;
  readonly sketches?: readonly AgentSketchMetadata[];
  readonly status: AgentRequestStatus;
  readonly summary?: string;
  readonly error?: string;
}

export interface AgentClientSnapshot {
  /** Composite state used by the handoff control. */
  readonly state: AgentClientState;
  /** Companion state, using the shared protocol vocabulary. */
  readonly connection: AgentStatusSnapshot["connection"];
  readonly listenerActive: boolean;
  /** Whether the last valid discovery response came from the local companion. */
  readonly companionReachable: boolean;
  readonly paired: boolean;
  /** Whether another browser currently owns this project's pairing. */
  readonly pairedElsewhere: boolean;
  readonly request: AgentRequestSnapshot | null;
  readonly error?: string;
}

const DISABLED_SNAPSHOT: AgentClientSnapshot = Object.freeze({
  state: "disabled",
  connection: "offline",
  listenerActive: false,
  companionReachable: false,
  paired: false,
  pairedElsewhere: false,
  request: null,
});

const DEFAULT_DISCOVERY_INTERVAL_MS = 2_000;
const SESSION_STORAGE_PREFIX = "nudge-ui-agent-session:";
const AUTO_CONNECT_DISABLED_PREFIX = "nudge-ui-agent-auto-connect-disabled:";

interface StoredAgentSession {
  readonly projectId: string;
  readonly origin: string;
  readonly sessionToken: string;
}

interface ActiveRequest {
  localRequestId: string;
  requestId: string;
  prompt: string;
  changeRevision?: number;
  clientDispatchId?: string;
  sketches?: readonly AgentSketchMetadata[];
  status: AgentRequestStatus;
  summary?: string;
  error?: string;
}

function randomId(prefix: string): string {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function sessionStorageKey(projectId: string): string {
  return `${SESSION_STORAGE_PREFIX}${encodeURIComponent(projectId)}`;
}

function readStoredSession(projectId: string, origin: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(sessionStorageKey(projectId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    // SAFETY: The typeof/Array.isArray guard above proves parsed is a non-array object with string keys.
    const value = parsed as Record<string, unknown>;
    if (value.projectId !== projectId || value.origin !== origin || typeof value.sessionToken !== "string" || value.sessionToken.length === 0) {
      localStorage.removeItem(sessionStorageKey(projectId));
      return null;
    }
    return value.sessionToken;
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredAgentSession): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(sessionStorageKey(session.projectId), JSON.stringify(session));
  } catch {
    // Storage can be disabled by browser privacy settings. The in-memory
    // pairing remains valid for this document in that case.
  }
}

function clearStoredSession(projectId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(sessionStorageKey(projectId));
  } catch {
    // Ignore storage failures; disconnect still clears the live connection.
  }
}

function autoConnectDisabled(projectId: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(`${AUTO_CONNECT_DISABLED_PREFIX}${encodeURIComponent(projectId)}`) === "true";
  } catch {
    return false;
  }
}

function setAutoConnectDisabled(projectId: string, disabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    const key = `${AUTO_CONNECT_DISABLED_PREFIX}${encodeURIComponent(projectId)}`;
    if (disabled) localStorage.setItem(key, "true");
    else localStorage.removeItem(key);
  } catch {
    // Privacy settings can disable storage. The current document still keeps
    // the explicit disconnect preference in memory.
  }
}

function statusForConnection(status: AgentStatusSnapshot): AgentStatusSnapshot["connection"] {
  if (status.connection === "working" || status.request?.status === "working") return "working";
  if (status.paired) return "paired";
  if (status.listenerActive) return "listening";
  return "offline";
}

function hashRevision(value: string): number {
  // FNV-1a is sufficient here: the revision is an opaque, bounded identity
  // used to prevent a later browser edit from being mistaken for the sent
  // canonical change set. Keep it in the safe-integer range accepted by the
  // companion protocol.
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) & 0x7fff_ffff;
}

/** Creates a stable numeric revision for one prompt snapshot. */
export function createPromptRevision(
  changes: readonly unknown[],
  structuralChanges: readonly unknown[] = [],
  sketches: readonly unknown[] = [],
): number {
  let serialized: string;
  try {
    serialized = JSON.stringify({ changes, structuralChanges, sketches }) ?? "";
  } catch {
    serialized = `${changes.length}:${structuralChanges.length}`;
  }
  return hashRevision(serialized);
}

/**
 * Browser-side companion client.
 *
 * Discovery is deliberately started by `start()`, which is guarded by the
 * dev-only flag. Constructing this class never opens a socket or performs a
 * network request, so importing the inspector remains inert in production.
 */
export class AgentClient {
  readonly projectId: string;
  readonly origin: string;

  private readonly transport: AgentBridgeTransport;
  private readonly discoveryIntervalMs: number;
  private readonly enabled: boolean;
  private canvasCommandHandler: AgentClientOptions["canvasCommandHandler"];
  private readonly listeners = new Set<() => void>();
  private snapshot: AgentClientSnapshot;
  private sessionToken: string | null = null;
  private activeRequest: ActiveRequest | null = null;
  private discoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private discoveryAbort: AbortController | null = null;
  private pairingAbort: AbortController | null = null;
  private dispatchAbort: AbortController | null = null;
  private eventSubscription: { close: () => void } | null = null;
  private started = false;
  private connection: AgentStatusSnapshot["connection"] = "offline";
  private listenerActive = false;
  private companionReachable = false;
  private paired = false;
  private pairedElsewhere = false;
  private lastError: string | undefined;
  private readonly autoConnect: boolean;
  private autoConnectSuppressed = false;

  constructor(options: AgentClientOptions) {
    this.projectId = options.projectId;
    this.origin = options.origin ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost");
    this.transport = options.transport ?? new HttpAgentBridgeTransport(options.endpoint);
    this.discoveryIntervalMs = options.discoveryIntervalMs ?? DEFAULT_DISCOVERY_INTERVAL_MS;
    this.canvasCommandHandler = options.canvasCommandHandler;
    this.autoConnect = options.autoConnect ?? shouldAutoConnectAgentBridge();
    this.autoConnectSuppressed = this.autoConnect && autoConnectDisabled(this.projectId);
    // The public demo renders the real inspector but intentionally keeps the
    // local MCP/agent bridge inert.
    this.enabled = isNudgeUiDev() && !isDemoRuntime();
    this.snapshot = this.enabled ? this.makeSnapshot() : DISABLED_SNAPSHOT;
  }

  /** Installs the controller callback used to acknowledge Canvas commands. */
  setCanvasCommandHandler(handler: AgentClientOptions["canvasCommandHandler"]): void {
    this.canvasCommandHandler = handler;
  }

  getSnapshot = (): AgentClientSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Starts loopback discovery. Calling it repeatedly is idempotent. */
  start(): void {
    if (!this.enabled || this.started) return;
    this.started = true;
    void this.restoreOrDiscover();
  }

  /** Stops discovery and closes the browser event stream. */
  stop(): void {
    if (!this.started && !this.eventSubscription) return;
    this.started = false;
    if (this.discoveryTimer !== null) {
      clearTimeout(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    this.discoveryAbort?.abort();
    this.discoveryAbort = null;
    this.pairingAbort?.abort();
    this.pairingAbort = null;
    this.dispatchAbort?.abort();
    this.dispatchAbort = null;
    this.eventSubscription?.close();
    this.eventSubscription = null;
    // `stop` is used by React effect cleanup and page remounts. Keep the
    // request and ephemeral token in memory/storage so a still-running
    // companion can be resumed; explicit `disconnect()` is the revocation
    // and interruption path.
    this.connection = "offline";
    this.listenerActive = false;
    this.companionReachable = false;
    this.paired = false;
    this.pairedElsewhere = false;
    this.publish();
  }

  private async restoreOrDiscover(): Promise<void> {
    if (!this.started || !this.enabled || this.pairingAbort) return;
    const token = this.sessionToken ?? readStoredSession(this.projectId, this.origin);
    if (token && this.transport.restore) {
      const abortController = new AbortController();
      this.discoveryAbort?.abort();
      this.discoveryAbort = abortController;
      try {
        const status = await this.transport.restore({
          projectId: this.projectId,
          origin: this.origin,
          sessionToken: token,
        } satisfies AgentSessionRequest, abortController.signal);
        if (!this.started || abortController.signal.aborted) return;
        if (status?.paired) {
          this.sessionToken = token;
          this.connection = "paired";
          this.paired = true;
          this.openEvents(token);
          this.applyStatus(status);
          return;
        }
        clearStoredSession(this.projectId);
        this.sessionToken = null;
        this.resetForDiscovery();
      } catch (error) {
        if (abortController.signal.aborted || !this.started) return;
        // A stale or revoked token is not a connection error. Clearing it
        // lets the normal listener discovery path offer a fresh pairing.
        clearStoredSession(this.projectId);
        this.sessionToken = null;
        this.resetForDiscovery();
        void error;
      } finally {
        if (this.discoveryAbort === abortController) this.discoveryAbort = null;
      }
    }
    await this.discover();
  }

  /** Runs an immediate authenticated restore or companion discovery probe. */
  async checkConnection(): Promise<void> {
    if (!this.enabled) return;
    if (!this.started) this.start();
    if (!this.started || this.pairingAbort) return;
    if (this.discoveryTimer !== null) {
      clearTimeout(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    this.lastError = undefined;
    this.publish();
    await this.restoreOrDiscover();
  }

  /** Triggers a new discovery probe after a connection loss. */
  reconnect(): void {
    if (!this.enabled) return;
    if (!this.started) {
      this.start();
      return;
    }
    this.eventSubscription?.close();
    this.eventSubscription = null;
    this.discoveryAbort?.abort();
    this.pairingAbort?.abort();
    this.pairingAbort = null;
    this.connection = "offline";
    this.listenerActive = false;
    this.companionReachable = false;
    this.paired = false;
    this.pairedElsewhere = false;
    this.lastError = undefined;
    this.publish();
    void this.restoreOrDiscover();
  }

  /** Pairs the browser with a reachable companion, including an idle agent. */
  async connect(): Promise<boolean> {
    return this.pairWith((request, signal) => this.transport.pair(request, signal));
  }

  /** Replaces an existing browser pairing after an explicit user action. */
  async takeOver(): Promise<boolean> {
    if (!this.transport.takeOver) return false;
    return this.pairWith((request, signal) => this.transport.takeOver!(request, signal));
  }

  private async pairWith(
    pair: (
      request: AgentPairRequest,
      signal?: AbortSignal,
    ) => Promise<PairingResponse>,
  ): Promise<boolean> {
    if (!this.enabled || !this.started || this.pairingAbort || this.paired || !this.companionReachable) return false;
    this.autoConnectSuppressed = false;
    setAutoConnectDisabled(this.projectId, false);
    if (this.connection === "working" || this.activeRequest?.status === "working") return false;
    const idleListenerActive = this.listenerActive;
    const idleCompanionReachable = this.companionReachable;
    this.connection = idleListenerActive ? "listening" : "offline";
    this.lastError = undefined;
    this.publish("pairing");
    const request: AgentPairRequest = {
      projectId: this.projectId,
      origin: this.origin,
      ...(typeof window !== "undefined" ? { pageUrl: window.location.href } : {}),
    };
    const abortController = new AbortController();
    this.discoveryAbort?.abort();
    this.pairingAbort = abortController;
    try {
      const pairing = await pair(request, abortController.signal);
      if (!this.started || abortController.signal.aborted) return false;
      if (pairing.protocolVersion !== undefined && pairing.protocolVersion !== AGENT_PROTOCOL_VERSION) {
        throw new Error("Agent bridge protocol version is not supported.");
      }
      if (pairing.projectId !== this.projectId) throw new Error("Agent bridge returned a different project.");
      if (pairing.status.projectId !== this.projectId || pairing.status.protocolVersion !== AGENT_PROTOCOL_VERSION || !pairing.status.paired) {
        throw new Error("Agent bridge returned an invalid pairing status.");
      }
      this.sessionToken = pairing.sessionToken;
      writeStoredSession({ projectId: this.projectId, origin: this.origin, sessionToken: pairing.sessionToken });
      this.connection = "paired";
      this.listenerActive = pairing.status.listenerActive;
      this.paired = true;
      this.pairedElsewhere = false;
      if (this.discoveryTimer !== null) {
        clearTimeout(this.discoveryTimer);
        this.discoveryTimer = null;
      }
      this.applyStatus(pairing.status);
      this.openEvents(pairing.sessionToken);
      this.publish();
      return true;
    } catch (error) {
      if (abortController.signal.aborted || !this.started) return false;
      this.lastError = errorMessage(error, "The agent could not be connected.");
      this.sessionToken = null;
      this.companionReachable = idleCompanionReachable;
      this.listenerActive = idleListenerActive;
      this.connection = idleListenerActive ? "listening" : "offline";
      this.paired = false;
      this.pairedElsewhere = error instanceof AgentBridgeHttpError
        && error.status === 409
        && error.code === "already_paired";
      this.publish(idleListenerActive ? "available" : "disconnected");
      return false;
    } finally {
      if (this.pairingAbort === abortController) {
        this.pairingAbort = null;
        this.scheduleDiscovery();
      }
    }
  }

  private openEvents(sessionToken: string): void {
    this.eventSubscription?.close();
    const eventsRequest: AgentEventsRequest = {
      projectId: this.projectId,
      origin: this.origin,
      sessionToken,
    };
    try {
      this.eventSubscription = this.transport.openEvents(eventsRequest, {
        onEvent: (event) => this.handleEvent(event),
        onDisconnect: (reason) => this.handleDisconnect(reason),
      });
    } catch (error) {
      this.handleDisconnect(errorMessage(error, "The agent event stream could not be opened."));
    }
  }

  /**
   * Dispatches one immutable prompt revision. The request enters `working`
   * synchronously, before the transport promise resolves, so the UI cannot
   * issue a second prompt while the first one is in flight.
   */
  async dispatchPrompt(
    prompt: string,
    changeRevision?: number,
    options: { readonly clientDispatchId?: string; readonly attachments?: readonly AgentSketchAttachment[] } = {},
  ): Promise<PromptDispatchResponse | null> {
    if (!this.enabled || !this.started || !this.paired || !this.listenerActive || !this.sessionToken) return null;
    if (!prompt || this.activeRequest?.status === "working") return null;
    const localRequestId = randomId("request");
    const request: AgentPromptDispatch = {
      projectId: this.projectId,
      sessionToken: this.sessionToken,
      prompt,
      ...(changeRevision === undefined ? {} : { changeRevision }),
      ...(options.clientDispatchId === undefined ? {} : { clientDispatchId: options.clientDispatchId }),
      ...(options.attachments === undefined ? {} : { attachments: options.attachments }),
    };
    const sketches = options.attachments?.map(({ data: _data, ...metadata }) => metadata);
    this.activeRequest = {
      localRequestId,
      requestId: localRequestId,
      prompt,
      ...(changeRevision === undefined ? {} : { changeRevision }),
      ...(options.clientDispatchId === undefined ? {} : { clientDispatchId: options.clientDispatchId }),
      ...(sketches === undefined ? {} : { sketches }),
      status: "working",
    };
    this.connection = "working";
    this.lastError = undefined;
    this.publish();
    const abortController = new AbortController();
    this.dispatchAbort = abortController;
    try {
      const response = await this.transport.dispatch(request, abortController.signal);
      if (abortController.signal.aborted) return null;
      if (response?.request?.requestId) {
        this.activeRequest = this.activeRequest && this.activeRequest.localRequestId === localRequestId
          ? {
            ...this.activeRequest,
            requestId: response.request.requestId,
            ...(response.request.clientDispatchId === undefined ? {} : { clientDispatchId: response.request.clientDispatchId }),
            ...(response.request.sketches === undefined ? {} : { sketches: response.request.sketches }),
          }
          : this.activeRequest;
      }
      if (response?.status && response.status !== "working") {
        this.applyRequestStatus(response.status, response.request.requestId);
      }
      return response ?? null;
    } catch (error) {
      if (!abortController.signal.aborted && this.activeRequest?.localRequestId === localRequestId) {
        this.activeRequest = { ...this.activeRequest, status: "failed", error: errorMessage(error, "The agent did not accept the prompt.") };
        this.connection = this.paired ? "paired" : this.listenerActive ? "listening" : "offline";
        this.lastError = this.activeRequest.error;
        this.publish();
      }
      return null;
    } finally {
      if (this.dispatchAbort === abortController) this.dispatchAbort = null;
    }
  }

  /** Interrupts local request state and asks the companion to revoke pairing. */
  disconnect(reason = "browser_disconnected"): void {
    this.autoConnectSuppressed = true;
    if (this.autoConnect) setAutoConnectDisabled(this.projectId, true);
    const token = this.sessionToken;
    const active = this.activeRequest;
    if (active?.status === "working") {
      this.activeRequest = { ...active, status: "interrupted", error: reason };
    }
    this.dispatchAbort?.abort();
    this.discoveryAbort?.abort();
    this.discoveryAbort = null;
    this.pairingAbort?.abort();
    this.pairingAbort = null;
    this.eventSubscription?.close();
    this.eventSubscription = null;
    this.sessionToken = null;
    clearStoredSession(this.projectId);
    this.connection = "offline";
    this.listenerActive = false;
    this.paired = false;
    this.pairedElsewhere = false;
    this.lastError = reason === "reconnect" || reason === "browser_disconnected" ? undefined : reason;
    this.publish();
    if (token) {
      const request: AgentDisconnectRequest = {
        projectId: this.projectId,
        origin: this.origin,
        sessionToken: token,
      };
      const disconnectResult = this.transport.disconnect?.(request);
      void disconnectResult?.catch(() => undefined);
    }
  }

  private async discover(): Promise<void> {
    if (!this.started || !this.enabled || this.pairingAbort) return;
    const abortController = new AbortController();
    this.discoveryAbort?.abort();
    this.discoveryAbort = abortController;
    try {
      const request: AgentDiscoveryRequest = { projectId: this.projectId, origin: this.origin };
      const status = await this.transport.discover(request, abortController.signal);
      if (!this.started || abortController.signal.aborted) return;
      if (status) {
        if (status.protocolVersion !== AGENT_PROTOCOL_VERSION || status.projectId !== this.projectId) {
          this.companionReachable = false;
          this.lastError = "The agent bridge project or protocol does not match this page.";
          this.publish();
        } else {
          this.companionReachable = true;
          if (this.connection !== "paired" && this.connection !== "working" && !this.pairingAbort) {
            // Discovery is unauthenticated. Another browser tab can own the
            // pairing, so do not adopt `paired` until this tab restores the
            // shared token. The next poll runs restore first in case a sibling
            // tab has just stored that token.
            const pairedElsewhere = status.paired && !this.sessionToken;
            this.applyStatus(status.paired ? {
              ...status,
              connection: status.listenerActive ? "listening" : "offline",
              paired: false,
              request: null,
            } : status, pairedElsewhere);
            if (this.autoConnect
              && !status.paired
              && !this.autoConnectSuppressed
              && !autoConnectDisabled(this.projectId)) void this.connect();
          }
        }
      } else if (this.connection !== "paired" && this.connection !== "working" && !this.pairingAbort) {
        this.connection = "offline";
        this.listenerActive = false;
        this.companionReachable = false;
        this.paired = false;
        this.pairedElsewhere = false;
        this.lastError = undefined;
        this.publish();
      }
    } catch (error) {
      if (!abortController.signal.aborted && this.started && this.connection !== "paired" && this.connection !== "working" && !this.pairingAbort) {
        this.connection = "offline";
        this.listenerActive = false;
        this.companionReachable = false;
        this.paired = false;
        this.pairedElsewhere = false;
        // Discovery failures are expected while the companion is not running;
        // retain a quiet disconnected state rather than flashing an error.
        this.lastError = undefined;
        this.publish();
      }
      void error;
    } finally {
      if (this.discoveryAbort === abortController) this.discoveryAbort = null;
      this.scheduleDiscovery();
    }
  }

  private scheduleDiscovery(): void {
    if (!this.started || this.paired || this.pairingAbort || this.discoveryIntervalMs <= 0 || this.discoveryTimer !== null) return;
    this.discoveryTimer = setTimeout(() => {
      this.discoveryTimer = null;
      void this.restoreOrDiscover();
    }, this.discoveryIntervalMs);
  }

  private scheduleReconnect(): void {
    if (!this.started || this.pairingAbort || this.discoveryIntervalMs <= 0 || this.discoveryTimer !== null) return;
    this.discoveryTimer = setTimeout(() => {
      this.discoveryTimer = null;
      void this.restoreOrDiscover();
    }, this.discoveryIntervalMs);
  }

  private handleEvent(event: AgentBridgeEvent): void {
    if (event.type === "status" || event.type === "connected") {
      if (event.status.projectId !== this.projectId || event.status.protocolVersion !== AGENT_PROTOCOL_VERSION) {
        this.handleDisconnect("The agent bridge project or protocol does not match this page.");
        return;
      }
      this.applyStatus(event.status);
      return;
    }
    if (event.type === "disconnected") {
      this.handleDisconnect(event.reason);
      return;
    }
    if (event.type === "canvas-command") {
      void this.acknowledgeCanvasCommand(event.command);
    }
  }

  private async acknowledgeCanvasCommand(command: CanvasCommand): Promise<void> {
    const handler = this.canvasCommandHandler;
    const sessionToken = this.sessionToken;
    if (!handler || !this.transport.acknowledgeCanvasCommand || !sessionToken) return;
    let acknowledgement: AgentCanvasAcknowledgementRequest["acknowledgement"];
    try {
      acknowledgement = await handler(command);
    } catch (error) {
      acknowledgement = {
        commandId: command.commandId,
        ok: false,
        error: {
          code: "controller_error",
          message: errorMessage(error, "The Canvas controller could not apply the command."),
        },
      };
    }
    // Every tab with the shared browser session receives the SSE command, but
    // only the Canvas lease owner may answer it. A read-only tab reports this
    // local sentinel; leave the command pending for the owning tab instead of
    // racing its acknowledgement with a false failure.
    if (!acknowledgement.ok && acknowledgement.error?.code === "workspace-locked") return;
    if (acknowledgement.commandId !== command.commandId) {
      acknowledgement = {
        commandId: command.commandId,
        ok: false,
        error: { code: "command_mismatch", message: "The Canvas controller acknowledged a different command." },
      };
    }
    const request: AgentCanvasAcknowledgementRequest = {
      projectId: this.projectId,
      origin: this.origin,
      sessionToken,
      acknowledgement,
    };
    try {
      await this.transport.acknowledgeCanvasCommand(request);
    } catch {
      // A command acknowledgement is best effort. The companion owns the
      // bounded timeout and reports any expired command to its agent host.
    }
  }

  private applyStatus(status: AgentStatusSnapshot, pairedElsewhere = false): void {
    this.companionReachable = true;
    this.lastError = undefined;
    this.listenerActive = status.listenerActive;
    this.paired = status.paired;
    this.pairedElsewhere = pairedElsewhere;
    this.connection = statusForConnection(status);
    if (status.paired && this.discoveryTimer !== null) {
      clearTimeout(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    if (status.request) {
      this.applyRequestStatus(
        status.request.status,
        status.request.requestId,
        status.request.summary,
        status.request.error,
        status.request.changeRevision,
        status.request.clientDispatchId,
        status.request.sketches,
      );
    } else if (status.listenerActive && status.paired && this.activeRequest?.status !== "working") {
      // A re-armed MCP listen call is the lifecycle boundary for the previous
      // terminal request. Drop only that terminal status; newer edits remain
      // in the inspector's canonical change log.
      this.activeRequest = null;
    } else if (this.activeRequest?.status === "working" && status.connection !== "working") {
      // The bridge may omit a request during a brief re-arm transition. Do
      // not mark a local request interrupted until the stream disconnects.
      this.connection = "working";
    }
    if (!status.paired && this.sessionToken) {
      this.handleDisconnect("The agent bridge pairing expired.");
      return;
    }
    this.publish();
  }

  private resetForDiscovery(): void {
    this.eventSubscription?.close();
    this.eventSubscription = null;
    this.connection = "offline";
    this.listenerActive = false;
    this.companionReachable = false;
    this.paired = false;
    this.pairedElsewhere = false;
    this.publish();
  }

  private applyRequestStatus(
    status: AgentRequestStatus,
    requestId: string,
    summary?: string,
    error?: string,
    changeRevision?: number,
    clientDispatchId?: string,
    sketches?: readonly AgentSketchMetadata[],
  ): void {
    const active = this.activeRequest;
    if (active && active.requestId !== requestId && active.localRequestId !== requestId) {
      // A fresh server id can arrive before the POST response. Associate it
      // with the one local request that was just marked working.
      if (active.status !== "working") return;
      this.activeRequest = { ...active, requestId };
    }
    if (!this.activeRequest) {
      this.activeRequest = {
        localRequestId: requestId,
        requestId,
        prompt: "",
        ...(changeRevision === undefined ? {} : { changeRevision }),
        ...(clientDispatchId === undefined ? {} : { clientDispatchId }),
        ...(sketches === undefined ? {} : { sketches }),
        status,
        ...(summary === undefined ? {} : { summary }),
        ...(error === undefined ? {} : { error }),
      };
    } else {
      this.activeRequest = {
        ...this.activeRequest,
        requestId,
        status,
        ...(changeRevision === undefined ? {} : { changeRevision }),
        ...(clientDispatchId === undefined ? {} : { clientDispatchId }),
        ...(sketches === undefined ? {} : { sketches }),
        ...(summary === undefined ? {} : { summary }),
        ...(error === undefined ? {} : { error }),
      };
    }
    if (status === "working") this.connection = "working";
    else if (this.paired) this.connection = "paired";
  }

  private handleDisconnect(reason = "The agent connection was lost."): void {
    this.eventSubscription?.close();
    this.eventSubscription = null;
    // An SSE disconnect is not proof that the coding request stopped. Keep
    // its last known state until an authenticated status restore says
    // otherwise. Explicit browser disconnect remains the interruption path.
    this.connection = "offline";
    this.listenerActive = false;
    this.companionReachable = false;
    this.paired = false;
    this.pairedElsewhere = false;
    this.lastError = reason;
    if (reason === "browser_disconnected") {
      // A remote takeover deliberately invalidates this browser's token. Do
      // not immediately race the new browser by auto-pairing again.
      this.autoConnectSuppressed = true;
      if (this.autoConnect) setAutoConnectDisabled(this.projectId, true);
    }
    this.publish();
    this.scheduleReconnect();
  }

  private makeSnapshot(stateOverride?: AgentClientState): AgentClientSnapshot {
    const request = this.activeRequest;
    const state = stateOverride ?? this.deriveState();
    return {
      state,
      connection: this.connection,
      listenerActive: this.listenerActive,
      companionReachable: this.companionReachable,
      paired: this.paired,
      pairedElsewhere: this.pairedElsewhere,
      request: request ? {
        requestId: request.requestId,
        ...(request.changeRevision === undefined ? {} : { changeRevision: request.changeRevision }),
        ...(request.clientDispatchId === undefined ? {} : { clientDispatchId: request.clientDispatchId }),
        ...(request.sketches === undefined ? {} : { sketches: request.sketches }),
        status: request.status,
        ...(request.summary === undefined ? {} : { summary: request.summary }),
        ...(request.error === undefined ? {} : { error: request.error }),
      } : null,
      ...(this.lastError === undefined ? {} : { error: this.lastError }),
    };
  }

  private deriveState(): AgentClientState {
    if (!this.enabled) return "disabled";
    if (this.connection === "offline") return "disconnected";
    if (this.connection === "listening") return "available";
    if (this.connection === "working" || this.activeRequest?.status === "working") return "working";
    if (this.activeRequest?.status === "completed") return "completed";
    if (this.activeRequest?.status === "failed") return "failed";
    if (this.activeRequest?.status === "interrupted") return "interrupted";
    return "connected";
  }

  private publish(stateOverride?: AgentClientState): void {
    this.snapshot = Object.freeze(this.makeSnapshot(stateOverride));
    for (const listener of this.listeners) listener();
  }
}

let configuredTransport: AgentBridgeTransport | undefined;
const clients = new Map<string, AgentClient>();

/** Sets a host/test transport for subsequently created project clients. */
export function configureAgentBridgeTransport(transport: AgentBridgeTransport | undefined): void {
  for (const client of clients.values()) client.stop();
  clients.clear();
  configuredTransport = transport;
}

/** Clears cached clients and their active streams. */
export function resetAgentClients(): void {
  for (const client of clients.values()) client.stop();
  clients.clear();
}

export function createAgentClient(options: AgentClientOptions): AgentClient {
  return new AgentClient({ ...options, transport: options.transport ?? configuredTransport });
}

export function getAgentClient(
  projectId: string,
  options: Omit<AgentClientOptions, "projectId"> = {},
): AgentClient {
  const origin = options.origin ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const key = `${projectId}\u0000${origin}`;
  let client = clients.get(key);
  if (!client) {
    client = createAgentClient({ ...options, projectId, origin });
    clients.set(key, client);
  }
  return client;
}

/** React hook used by the inspector handoff control. */
export function useAgentClient(projectId: string, suppliedClient?: AgentClient): AgentClientSnapshot {
  const client = useMemo(
    () => suppliedClient ?? getAgentClient(projectId),
    [projectId, suppliedClient],
  );
  useEffect(() => {
    client.start();
    return () => client.stop();
  }, [client]);
  return useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
}
