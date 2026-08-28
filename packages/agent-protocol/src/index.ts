/**
 * Public, host-neutral contracts shared by the Nudge browser inspector and
 * its local MCP companion.
 *
 * This module deliberately has no Node, browser, MCP SDK, or framework
 * imports. Hosts can use the same validation and message shapes without
 * pulling the companion into a browser bundle.
 */

export const AGENT_PROTOCOL_VERSION = 1 as const;

export const AGENT_PROTOCOL_LIMITS = {
  projectId: 256,
  workspaceRoot: 4096,
  origin: 2048,
  sessionToken: 256,
  requestId: 256,
  commandId: 256,
  prompt: 32_000,
  groupId: 256,
  label: 160,
  routeUrl: 2048,
  routeTitle: 512,
  routeCount: 64,
  canvasCardCount: 128,
} as const;

/**
 * Returns the default project-specific loopback port used by the CLI.
 *
 * The value is deterministic so a browser can probe the companion without a
 * port file, while the range stays high enough to avoid common dev servers.
 * Callers may still override it with an explicit port when a collision occurs.
 */
export function defaultBridgePort(projectId: string): number {
  if (!nonEmptyString(projectId, AGENT_PROTOCOL_LIMITS.projectId)) {
    throw new TypeError("projectId must be a bounded non-empty string");
  }
  let hash = 2_166_136_261;
  for (let index = 0; index < projectId.length; index += 1) {
    hash ^= projectId.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return 30_000 + ((hash >>> 0) % 20_000);
}

export type AgentProtocolVersion = typeof AGENT_PROTOCOL_VERSION;

/** A project identity is the pairing boundary for one companion process. */
export interface AgentProjectIdentity {
  readonly projectId: string;
  /** Omitted until an explicit first browser pairing locks the origin. */
  readonly origin?: string;
  readonly workspaceRoot?: string;
}

/** A same-origin route that an agent asks the browser to add to Canvas. */
export interface AgentRoute {
  readonly url: string;
  readonly title?: string;
  /** A short user-facing name. When absent, the browser derives one. */
  readonly label?: string;
}

/** The owner marker lets the browser remove only groups created by the agent. */
export type CanvasGroupOwner = "agent" | "user";

/** A browser-reported comparison group. */
export interface CanvasGroup {
  readonly id: string;
  readonly label: string;
  readonly owner: CanvasGroupOwner;
  readonly routes: readonly AgentRoute[];
}

/** A compact, serialisable Canvas snapshot returned by the browser. */
export interface CanvasState {
  readonly mode: "inspect" | "canvas";
  readonly groups: readonly CanvasGroup[];
  readonly focusedGroupId?: string | null;
  readonly focusedRouteUrl?: string | null;
}

export const CANVAS_COMMAND_TYPES = [
  "read-state",
  "present-routes",
  "focus-group",
  "fit-all",
  "remove-group",
] as const;

export type CanvasCommandType = (typeof CANVAS_COMMAND_TYPES)[number];

export interface ReadCanvasStateCommand {
  readonly type: "read-state";
  readonly commandId: string;
}

export interface PresentRoutesCommand {
  readonly type: "present-routes";
  readonly commandId: string;
  readonly groupId: string;
  readonly label: string;
  readonly routes: readonly AgentRoute[];
}

export interface FocusCanvasGroupCommand {
  readonly type: "focus-group";
  readonly commandId: string;
  readonly groupId: string;
}

export interface FitCanvasCommand {
  readonly type: "fit-all";
  readonly commandId: string;
}

export interface RemoveCanvasGroupCommand {
  readonly type: "remove-group";
  readonly commandId: string;
  readonly groupId: string;
}

/** Commands sent from the companion to the paired browser over SSE. */
export type CanvasCommand =
  | ReadCanvasStateCommand
  | PresentRoutesCommand
  | FocusCanvasGroupCommand
  | FitCanvasCommand
  | RemoveCanvasGroupCommand;

export interface CanvasCommandError {
  readonly code: string;
  readonly message: string;
}

export interface CanvasCommandResult {
  readonly commandId: string;
  readonly ok: boolean;
  readonly state?: CanvasState;
  readonly group?: CanvasGroup;
  readonly error?: CanvasCommandError;
}

/** A prompt is immutable after it is accepted by the browser bridge. */
export interface AgentPromptRequest {
  readonly requestId: string;
  readonly projectId: string;
  readonly prompt: string;
  /** The browser's canonical change revision captured at dispatch time. */
  readonly changeRevision?: number;
}

export type AgentRequestStatus = "working" | "completed" | "failed" | "interrupted";

export interface AgentRequestOutcome {
  readonly requestId: string;
  readonly status: AgentRequestStatus;
  readonly summary?: string;
  readonly error?: string;
}

export type AgentConnectionState = "offline" | "listening" | "paired" | "working";

export interface AgentStatusSnapshot {
  readonly protocolVersion: AgentProtocolVersion;
  readonly projectId: string;
  readonly connection: AgentConnectionState;
  readonly listenerActive: boolean;
  readonly paired: boolean;
  /** The last paired page, retained only for this process lifetime. */
  readonly pageUrl?: string | null;
  readonly request: (AgentPromptRequest & {
    readonly status: AgentRequestStatus;
    readonly summary?: string;
    readonly error?: string;
  }) | null;
}

export type BridgeEventType = "status" | "canvas-command" | "connected" | "disconnected";

export interface BridgeStatusEvent {
  readonly type: "status";
  readonly status: AgentStatusSnapshot;
}

export interface BridgeConnectedEvent {
  readonly type: "connected";
  readonly status: AgentStatusSnapshot;
}

export interface BridgeDisconnectedEvent {
  readonly type: "disconnected";
  readonly reason?: string;
}

export interface BridgeCanvasCommandEvent {
  readonly type: "canvas-command";
  readonly command: CanvasCommand;
}

/** Payload delivered to a browser SSE connection. */
export type BridgeEvent =
  | BridgeStatusEvent
  | BridgeConnectedEvent
  | BridgeDisconnectedEvent
  | BridgeCanvasCommandEvent;

export interface BridgeEnvelope {
  readonly protocolVersion: AgentProtocolVersion;
  readonly projectId: string;
  readonly sessionToken: string;
  readonly event: BridgeEvent;
}

export interface CanvasCommandAcknowledgement {
  readonly commandId: string;
  readonly ok: boolean;
  readonly state?: CanvasState;
  readonly group?: CanvasGroup;
  readonly error?: CanvasCommandError;
}

export interface PairingRequest {
  readonly projectId: string;
  readonly origin: string;
  /** The active page is retained only while this process is alive. */
  readonly pageUrl?: string;
}

export interface PairingResponse {
  readonly protocolVersion: AgentProtocolVersion;
  readonly projectId: string;
  readonly origin: string;
  readonly sessionToken: string;
  readonly pageUrl?: string;
  readonly status: AgentStatusSnapshot;
}

export interface PromptDispatchRequest {
  readonly projectId: string;
  readonly sessionToken: string;
  readonly prompt: string;
  readonly changeRevision?: number;
}

export interface PromptDispatchResponse {
  readonly request: AgentPromptRequest;
  readonly status: AgentRequestStatus;
}

export interface StatusEventRequest {
  readonly projectId: string;
  readonly sessionToken: string;
}

export interface AgentStatusUpdate {
  readonly requestId: string;
  readonly status: AgentRequestStatus;
  readonly summary?: string;
  readonly error?: string;
}

export interface ProtocolErrorShape {
  readonly code: string;
  readonly message: string;
}

const ORIGIN_PROTOCOLS = new Set(["http:", "https:"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function nonEmptyString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function optionalString(value: unknown, maximum: number): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length <= maximum);
}

function optionalRevision(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

/**
 * Returns a canonical origin or null. Credentials, paths, and fragments are
 * rejected so the browser cannot broaden the pairing boundary accidentally.
 */
export function canonicalOrigin(value: unknown): string | null {
  if (!nonEmptyString(value, AGENT_PROTOCOL_LIMITS.origin)) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (!ORIGIN_PROTOCOLS.has(parsed.protocol) || parsed.username || parsed.password) return null;
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
  return parsed.origin;
}

/** Returns true only for exact, canonical HTTP(S) origins. */
export function isCanonicalOrigin(value: unknown): value is string {
  return canonicalOrigin(value) === value;
}

/**
 * Checks an origin against an explicit allow-list. An empty allow-list does
 * not mean wildcard access; callers must choose an origin before pairing.
 */
export function isAllowedOrigin(value: unknown, allowedOrigins: readonly string[]): value is string {
  const origin = canonicalOrigin(value);
  if (!origin || allowedOrigins.length === 0) return false;
  return allowedOrigins.some((candidate) => canonicalOrigin(candidate) === origin);
}

/**
 * Validates an agent route and ensures it belongs to the paired origin.
 * Fragments are retained because they are useful initial Canvas locations.
 */
export function isSameOriginRoute(value: unknown, origin: string): value is AgentRoute {
  if (!isRecord(value) || !hasOnlyKeys(value, ["url", "title", "label"])) return false;
  if (!nonEmptyString(value.url, AGENT_PROTOCOL_LIMITS.routeUrl)) return false;
  if (!optionalString(value.title, AGENT_PROTOCOL_LIMITS.routeTitle)) return false;
  if (!optionalString(value.label, AGENT_PROTOCOL_LIMITS.label)) return false;
  const expectedOrigin = canonicalOrigin(origin);
  if (!expectedOrigin) return false;
  let route: URL;
  try {
    route = new URL(value.url, expectedOrigin);
  } catch {
    return false;
  }
  if (route.origin !== expectedOrigin || !ORIGIN_PROTOCOLS.has(route.protocol)) return false;
  return true;
}

/** Validates and normalises route values for a presentation command. */
export function validateRoutes(value: unknown, origin: string): AgentRoute[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > AGENT_PROTOCOL_LIMITS.routeCount) {
    throw new TypeError(`routes must contain between 1 and ${AGENT_PROTOCOL_LIMITS.routeCount} items`);
  }
  const expectedOrigin = canonicalOrigin(origin);
  if (!expectedOrigin) throw new TypeError("origin must be a canonical HTTP(S) origin");
  return value.map((route, index) => {
    if (!isSameOriginRoute(route, expectedOrigin)) {
      throw new TypeError(`routes[${index}] must be a same-origin route`);
    }
    const input = route as AgentRoute;
    const parsed = new URL(input.url, expectedOrigin);
    return {
      url: parsed.href,
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.label === undefined ? {} : { label: input.label }),
    };
  });
}

/** Validates the fields shared by every companion message. */
export function isProtocolVersion(value: unknown): value is AgentProtocolVersion {
  return value === AGENT_PROTOCOL_VERSION;
}

export function isProjectIdentity(value: unknown): value is AgentProjectIdentity {
  if (!isRecord(value) || !hasOnlyKeys(value, ["projectId", "origin", "workspaceRoot"])) return false;
  return nonEmptyString(value.projectId, AGENT_PROTOCOL_LIMITS.projectId)
    && (value.origin === undefined || isCanonicalOrigin(value.origin))
    && optionalString(value.workspaceRoot, AGENT_PROTOCOL_LIMITS.workspaceRoot);
}

export function isAgentPromptRequest(value: unknown): value is AgentPromptRequest {
  if (!isRecord(value) || !hasOnlyKeys(value, ["requestId", "projectId", "prompt", "changeRevision"])) return false;
  return nonEmptyString(value.requestId, AGENT_PROTOCOL_LIMITS.requestId)
    && nonEmptyString(value.projectId, AGENT_PROTOCOL_LIMITS.projectId)
    && nonEmptyString(value.prompt, AGENT_PROTOCOL_LIMITS.prompt)
    && optionalRevision(value.changeRevision);
}

export function isAgentStatusUpdate(value: unknown): value is AgentStatusUpdate {
  if (!isRecord(value) || !hasOnlyKeys(value, ["requestId", "status", "summary", "error"])) return false;
  return nonEmptyString(value.requestId, AGENT_PROTOCOL_LIMITS.requestId)
    && (value.status === "working" || value.status === "completed"
      || value.status === "failed" || value.status === "interrupted")
    && optionalString(value.summary, AGENT_PROTOCOL_LIMITS.prompt)
    && optionalString(value.error, AGENT_PROTOCOL_LIMITS.prompt);
}

export function isCanvasState(value: unknown): value is CanvasState {
  if (!isRecord(value) || !hasOnlyKeys(value, ["mode", "groups", "focusedGroupId", "focusedRouteUrl"])) return false;
  if (value.mode !== "inspect" && value.mode !== "canvas") return false;
  if (!Array.isArray(value.groups) || value.groups.length > AGENT_PROTOCOL_LIMITS.canvasCardCount) return false;
  if (!(value.focusedGroupId === undefined || value.focusedGroupId === null
    || nonEmptyString(value.focusedGroupId, AGENT_PROTOCOL_LIMITS.groupId))) return false;
  if (!(value.focusedRouteUrl === undefined || value.focusedRouteUrl === null
    || nonEmptyString(value.focusedRouteUrl, AGENT_PROTOCOL_LIMITS.routeUrl))) return false;
  return value.groups.every(isCanvasGroup);
}

export function isCanvasGroup(value: unknown): value is CanvasGroup {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "label", "owner", "routes"])) return false;
  return nonEmptyString(value.id, AGENT_PROTOCOL_LIMITS.groupId)
    && nonEmptyString(value.label, AGENT_PROTOCOL_LIMITS.label)
    && (value.owner === "agent" || value.owner === "user")
    && Array.isArray(value.routes)
    && value.routes.length <= AGENT_PROTOCOL_LIMITS.routeCount
    && value.routes.every((route) => isRecord(route)
      && nonEmptyString(route.url, AGENT_PROTOCOL_LIMITS.routeUrl)
      && optionalString(route.title, AGENT_PROTOCOL_LIMITS.routeTitle)
      && optionalString(route.label, AGENT_PROTOCOL_LIMITS.label));
}

export function isCanvasCommand(value: unknown): value is CanvasCommand {
  if (!isRecord(value) || !hasOnlyKeys(value, ["type", "commandId", "groupId", "label", "routes"])) return false;
  if (!nonEmptyString(value.commandId, AGENT_PROTOCOL_LIMITS.commandId)) return false;
  switch (value.type) {
    case "read-state":
    case "fit-all":
      return true;
    case "focus-group":
    case "remove-group":
      return nonEmptyString(value.groupId, AGENT_PROTOCOL_LIMITS.groupId);
    case "present-routes":
      return nonEmptyString(value.groupId, AGENT_PROTOCOL_LIMITS.groupId)
        && nonEmptyString(value.label, AGENT_PROTOCOL_LIMITS.label)
        && Array.isArray(value.routes)
        && value.routes.length > 0
        && value.routes.length <= AGENT_PROTOCOL_LIMITS.routeCount
        && value.routes.every((route) => isRecord(route)
          && nonEmptyString(route.url, AGENT_PROTOCOL_LIMITS.routeUrl)
          && optionalString(route.title, AGENT_PROTOCOL_LIMITS.routeTitle)
          && optionalString(route.label, AGENT_PROTOCOL_LIMITS.label));
    default:
      return false;
  }
}

/** Creates a stable protocol error shape without exposing thrown values. */
export function protocolError(code: string, message: string): ProtocolErrorShape {
  if (!nonEmptyString(code, 128) || !nonEmptyString(message, AGENT_PROTOCOL_LIMITS.prompt)) {
    throw new TypeError("Protocol errors require bounded code and message strings");
  }
  return { code, message };
}
