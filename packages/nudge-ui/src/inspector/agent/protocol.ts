import type {
  AgentStatusSnapshot,
  CanvasCommand,
  CanvasCommandAcknowledgement,
  CanvasCommandResult,
  AgentSketchAttachment,
  PairingResponse,
  PromptDispatchResponse,
} from "@nudge-ui/agent-protocol";

/**
 * Browser transport port for the shared Nudge agent protocol.
 *
 * Domain messages come from the private shared protocol module; this file only
 * adds the browser's injectable HTTP/SSE transport boundary. Keeping that
 * boundary local lets inspector tests use a deterministic fake while the
 * companion remains the owner of MCP and Node-specific code.
 */
export {
  AGENT_PROTOCOL_LIMITS,
  AGENT_PROTOCOL_VERSION,
  defaultBridgePort,
  CANVAS_COMMAND_TYPES,
  canonicalOrigin,
  isAgentPromptRequest,
  isAgentSketchAttachment,
  isAgentSketchAnnotation,
  isAgentSketchCaptureMetadata,
  isAgentSketchMetadata,
  isAgentStatusUpdate,
  isAllowedOrigin,
  isCanvasCommand,
  isCanvasGroup,
  isCanvasState,
  isCanonicalOrigin,
  isProjectIdentity,
  isSameOriginRoute,
  protocolError,
  validateSketchAttachments,
  validateRoutes,
} from "@nudge-ui/agent-protocol";

export type {
  AgentConnectionState,
  AgentProjectIdentity,
  AgentPromptRequest,
  AgentDeliveredPrompt,
  AgentSketchAttachment,
  AgentSketchAnnotation,
  AgentSketchCaptureMetadata,
  AgentSketchMetadata,
  AgentRequestOutcome,
  AgentRequestStatus,
  AgentRoute,
  AgentStatusSnapshot,
  AgentStatusUpdate,
  BridgeCanvasCommandEvent,
  BridgeConnectedEvent,
  BridgeDisconnectedEvent,
  BridgeEnvelope,
  BridgeEvent,
  BridgeEventType,
  BridgeStatusEvent,
  CanvasCommand,
  CanvasCommandAcknowledgement,
  CanvasCommandError,
  CanvasCommandResult,
  CanvasGroup,
  CanvasGroupOwner,
  CanvasState,
  FitCanvasCommand,
  FocusCanvasGroupCommand,
  PairingRequest,
  PairingResponse,
  PresentRoutesCommand,
  PromptDispatchRequest,
  PromptDispatchResponse,
  ReadCanvasStateCommand,
  RemoveCanvasGroupCommand,
  StatusEventRequest,
  AgentProtocolVersion,
} from "@nudge-ui/agent-protocol";

export interface AgentBridgeEndpointConfig {
  readonly baseUrl?: string;
  readonly healthUrl?: string;
  readonly pairUrl?: string;
  readonly eventsUrl?: string;
  readonly promptUrl?: string;
  readonly statusUrl?: string;
  readonly canvasAckUrl?: string;
  readonly disconnectUrl?: string;
  readonly takeoverUrl?: string;
  /** Pair automatically when this endpoint came from the trusted dev host. */
  readonly autoConnect?: boolean;
}

export interface AgentDiscoveryRequest {
  readonly projectId: string;
  readonly origin: string;
}

export interface AgentPairRequest {
  readonly projectId: string;
  readonly origin: string;
  readonly pageUrl?: string;
}

export interface AgentEventsRequest {
  readonly projectId: string;
  readonly origin: string;
  readonly sessionToken: string;
}

export interface AgentSessionRequest {
  readonly projectId: string;
  readonly origin: string;
  readonly sessionToken: string;
}

export interface AgentPromptDispatch {
  readonly projectId: string;
  readonly sessionToken: string;
  readonly prompt: string;
  readonly changeRevision?: number;
  readonly clientDispatchId?: string;
  readonly attachments?: readonly AgentSketchAttachment[];
}

export interface AgentDisconnectRequest {
  readonly projectId: string;
  readonly origin: string;
  readonly sessionToken: string;
}

export interface AgentCanvasAcknowledgementRequest {
  readonly projectId: string;
  readonly origin: string;
  readonly sessionToken: string;
  readonly acknowledgement: CanvasCommandAcknowledgement;
}

export interface AgentEventHandlers {
  readonly onEvent: (event: AgentBridgeEvent) => void;
  readonly onDisconnect: (reason?: string) => void;
}

export interface AgentEventSubscription {
  readonly close: () => void;
}

/** Events delivered by the companion's SSE stream. */
export type AgentBridgeEvent =
  | { readonly type: "status"; readonly status: AgentStatusSnapshot }
  | { readonly type: "connected"; readonly status: AgentStatusSnapshot }
  | { readonly type: "disconnected"; readonly reason?: string }
  | { readonly type: "canvas-command"; readonly command: CanvasCommand };

export interface AgentBridgeTransport {
  readonly discover: (
    request: AgentDiscoveryRequest,
    signal?: AbortSignal,
  ) => Promise<AgentStatusSnapshot | null>;
  readonly restore?: (
    request: AgentSessionRequest,
    signal?: AbortSignal,
  ) => Promise<AgentStatusSnapshot | null>;
  readonly pair: (
    request: AgentPairRequest,
    signal?: AbortSignal,
  ) => Promise<PairingResponse>;
  readonly openEvents: (
    request: AgentEventsRequest,
    handlers: AgentEventHandlers,
  ) => AgentEventSubscription;
  readonly dispatch: (
    request: AgentPromptDispatch,
    signal?: AbortSignal,
  ) => Promise<PromptDispatchResponse | null>;
  readonly disconnect?: (
    request: AgentDisconnectRequest,
    signal?: AbortSignal,
  ) => Promise<void>;
  /** Deliberately revokes another browser pairing before pairing this page. */
  readonly takeOver?: (
    request: AgentPairRequest,
    signal?: AbortSignal,
  ) => Promise<PairingResponse>;
  readonly acknowledgeCanvasCommand?: (
    request: AgentCanvasAcknowledgementRequest,
    signal?: AbortSignal,
  ) => Promise<void>;
}

export interface AgentClientOptions {
  readonly projectId: string;
  readonly origin?: string;
  readonly transport?: AgentBridgeTransport;
  readonly endpoint?: AgentBridgeEndpointConfig;
  readonly autoConnect?: boolean;
  readonly discoveryIntervalMs?: number;
  readonly canvasCommandHandler?: (
    command: CanvasCommand,
  ) => CanvasCommandResult | Promise<CanvasCommandResult>;
}
