/**
 * Companion-facing aliases and transport envelopes.
 *
 * The domain contracts live in the private shared protocol module. This public
 * subpath keeps transport names discoverable for Node consumers while
 * preserving one protocol vocabulary for browser and agent adapters.
 */
export {
  AGENT_PROTOCOL_LIMITS,
  AGENT_PROTOCOL_VERSION,
  CANVAS_COMMAND_TYPES,
  canonicalOrigin,
  defaultBridgePort,
  isAgentPromptRequest,
  isAgentStatusUpdate,
  isAllowedOrigin,
  isCanvasCommand,
  isCanvasGroup,
  isCanvasState,
  isCanonicalOrigin,
  isProjectIdentity,
  isSameOriginRoute,
  protocolError,
  validateRoutes,
} from "@nudge-ui/agent-protocol";

export type {
  AgentConnectionState,
  AgentProjectIdentity,
  AgentPromptRequest,
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
} from "@nudge-ui/agent-protocol";

/** Stable endpoint names used by the loopback browser bridge. */
export const BRIDGE_ENDPOINTS = {
  health: "/health",
  pair: "/pair",
  events: "/events",
  prompt: "/prompt",
  status: "/status",
  canvasAcknowledgement: "/canvas/ack",
  disconnect: "/disconnect",
} as const;

export type BridgeEndpoint = (typeof BRIDGE_ENDPOINTS)[keyof typeof BRIDGE_ENDPOINTS];

/** Error body returned by every rejected bridge request. */
export interface BridgeHttpError {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}
