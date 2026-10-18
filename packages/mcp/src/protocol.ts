export {
  AGENT_PROTOCOL_LIMITS,
  AGENT_PROTOCOL_VERSION,
  CANVAS_COMMAND_TYPES,
  canonicalOrigin,
  isAgentPromptRequest,
  isAgentSketchAttachment,
  isAgentSketchCaptureMetadata,
  isAgentSketchMetadata,
  isAgentStatusUpdate,
  isAgentActivity,
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
  AgentActivity,
  BridgeActivityEvent,
  AgentConnectionState,
  AgentProjectIdentity,
  AgentPromptRequest,
  AgentDeliveredPrompt,
  AgentSketchAttachment,
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
} from "@nudge-ui/agent-protocol";

/** Stable endpoint names used by the loopback browser bridge. */
export { BRIDGE_ENDPOINTS } from "@nudge-ui/agent-protocol";
export type { BridgeEndpoint } from "@nudge-ui/agent-protocol";

/** Private, loopback-only endpoints used by an MCP adapter process. */
export const AGENT_CONTROL_ENDPOINTS = {
  health: "/__nudge/agent/health",
  claim: "/__nudge/agent/claim",
  heartbeat: "/__nudge/agent/heartbeat",
  release: "/__nudge/agent/release",
  listen: "/__nudge/agent/listen",
  status: "/__nudge/agent/status",
  request: "/__nudge/agent/request",
  reportStatus: "/__nudge/agent/report-status",
  activity: "/__nudge/agent/activity",
  canvas: "/__nudge/agent/canvas",
} as const;

export interface BridgeHttpError {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}
