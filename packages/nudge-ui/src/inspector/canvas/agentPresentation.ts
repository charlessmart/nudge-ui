import { contentSourceUrl } from "./frameContent.ts";
import {
  AGENT_PROTOCOL_LIMITS,
  isCanvasCommand,
  validateRoutes,
  type AgentRoute,
  type CanvasCommand,
  type CanvasCommandResult,
  type CanvasGroup,
  type CanvasState,
} from "@nudge-ui/agent-protocol";
import { isNudgeUiDev } from "../runtime/devFlag.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { canWriteWorkspace } from "./workspaceLease.ts";
import {
  appendLinkedGroupCards,
  getFrameGroup,
  getFrameGroups,
  setFrameGroup,
  removeFrameGroup,
  batchCanvasChanges,
  fitAllCards,
  focusCard,
  focusCanvasCards,
  getCanvasCards,
  getCanvasMode,
  getFocusedCardId,
  removeCanvasCard,
  setCanvasMode,
  type CanvasCard,
} from "./canvasStore.ts";

/**
 * Renderer acknowledgements are deliberately shorter than the companion's
 * request timeout. A controller can therefore receive a useful partial-failure
 * acknowledgement instead of waiting for the browser bridge to expire first.
 */
export const DEFAULT_RENDERER_READY_TIMEOUT_MS = 4_000;
export const MAX_RENDERER_READY_TIMEOUT_MS = 5_000;
export const MAX_PRESENTATION_ROUTES = AGENT_PROTOCOL_LIMITS.routeCount;
export const MAX_GROUP_LABEL_LENGTH = AGENT_PROTOCOL_LIMITS.label;

const DEFAULT_AGENT_ID = "agent";

export type AgentRendererStatus = "unknown" | "pending" | "ready" | "error" | "timeout";

export interface AgentRendererReadiness {
  allReady: boolean;
  statuses: Record<string, AgentRendererStatus>;
  readyCardIds: string[];
  failedCardIds: string[];
  timedOutCardIds: string[];
}

/** Direct callers may use URL strings; the shared command uses AgentRoute. */
export interface AgentPresentationRoute {
  url: string;
  title?: string | null;
  label?: string;
}

export type AgentPresentationRouteInput = string | AgentPresentationRoute;

export interface PresentAgentRoutesInput {
  label: string;
  routes?: readonly AgentPresentationRouteInput[];
  /** Convenience spelling for direct browser callers. */
  urls?: readonly string[];
  /** Commands use an explicit group ID; direct calls may receive a generated ID. */
  groupId?: string;
  /** Internal pairing identity used to enforce remove-own semantics. */
  agentId?: string;
  readyTimeoutMs?: number;
}

export interface AgentRoutesPresentation {
  group: CanvasGroup;
  cards: CanvasCard[];
  readiness: AgentRendererReadiness;
}

export type AgentPresentationState = CanvasState;

export type AgentPresentationErrorCode =
  | "not-development"
  | "workspace-locked"
  | "invalid-command"
  | "invalid-label"
  | "invalid-route"
  | "too-many-routes"
  | "group-not-found"
  | "group-id-conflict"
  | "not-group-owner"
  | "busy"
  | "not-paired"
  | "origin-mismatch"
  | "project-mismatch"
  | "token-mismatch"
  | "protocol-mismatch"
  | "renderer-timeout"
  | "renderer-error";

export class AgentPresentationError extends Error {
  readonly code: AgentPresentationErrorCode;

  constructor(code: AgentPresentationErrorCode, message: string) {
    super(message);
    this.name = "AgentPresentationError";
    this.code = code;
  }
}

interface RendererReadinessEntry {
  status: AgentRendererStatus;
  message?: string;
}

interface ReadinessWaiter {
  cardIds: readonly string[];
  resolve: (readiness: AgentRendererReadiness) => void;
  timer: ReturnType<typeof setTimeout>;
}

const rendererReadiness = new Map<string, RendererReadinessEntry>();
const readinessWaiters = new Set<ReadinessWaiter>();
let generatedGroupId = 0;
let activePresentation = false;

interface PresentationCredentials {
  projectId: string;
  agentId: string;
}

function currentProjectId(): string {
  return getNudgeUiRuntimeConfig().projectId;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createGroupId(): string {
  const randomId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : undefined;
  if (randomId) return `agent-group-${randomId}`;
  generatedGroupId += 1;
  return `agent-group-${generatedGroupId}`;
}

function validateLabel(value: unknown): string {
  if (!isNonEmptyString(value)) {
    throw new AgentPresentationError("invalid-label", "A route group label is required.");
  }
  const label = value.trim();
  if (label.length > MAX_GROUP_LABEL_LENGTH || /[\u0000-\u001f\u007f]/.test(label)) {
    throw new AgentPresentationError(
      "invalid-label",
      `Route group labels must be between 1 and ${MAX_GROUP_LABEL_LENGTH} printable characters.`,
    );
  }
  return label;
}

function routeForValidation(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return { url: value };
  if (!isRecord(value)) {
    throw new AgentPresentationError("invalid-route", "Each presented route must be a URL object.");
  }
  return value;
}

function normalizeRoutes(input: PresentAgentRoutesInput): AgentRoute[] {
  const rawRoutes = input.routes ?? input.urls;
  if (!rawRoutes || rawRoutes.length === 0) {
    throw new AgentPresentationError("invalid-route", "At least one presented route is required.");
  }
  if (rawRoutes.length > MAX_PRESENTATION_ROUTES) {
    throw new AgentPresentationError(
      "too-many-routes",
      `A route group may contain at most ${MAX_PRESENTATION_ROUTES} routes.`,
    );
  }

  try {
    return validateRoutes(
      rawRoutes.map((route) => {
        const candidate = routeForValidation(route);
        return {
          url: candidate.url,
          ...(typeof candidate.title === "string" ? { title: candidate.title } : {}),
          ...(typeof candidate.label === "string" ? { label: candidate.label } : {}),
        };
      }),
      window.location.origin,
    );
  } catch (error) {
    throw new AgentPresentationError(
      "invalid-route",
      error instanceof Error ? error.message : "Presented routes must be same-origin URLs.",
    );
  }
}

function ensureDevelopment(): void {
  if (!isNudgeUiDev()) {
    throw new AgentPresentationError(
      "not-development",
      "Agent Canvas presentation is available only in development mode.",
    );
  }
}

function ensureWritable(): void {
  if (!canWriteWorkspace()) {
    throw new AgentPresentationError(
      "workspace-locked",
      "The active browser controller does not own the Nudge workspace.",
    );
  }
}

function clampReadyTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_RENDERER_READY_TIMEOUT_MS;
  if (!Number.isFinite(value) || value < 0) {
    throw new AgentPresentationError("invalid-command", "readyTimeoutMs must be a finite non-negative number.");
  }
  return Math.min(MAX_RENDERER_READY_TIMEOUT_MS, value);
}

function statusForCard(cardId: string): AgentRendererStatus {
  return rendererReadiness.get(cardId)?.status ?? "unknown";
}

function buildReadiness(cardIds: readonly string[]): AgentRendererReadiness {
  const statuses: Record<string, AgentRendererStatus> = {};
  const readyCardIds: string[] = [];
  const failedCardIds: string[] = [];
  const timedOutCardIds: string[] = [];
  for (const cardId of cardIds) {
    const status = statusForCard(cardId);
    statuses[cardId] = status;
    if (status === "ready") readyCardIds.push(cardId);
    if (status === "error") failedCardIds.push(cardId);
    if (status === "timeout") timedOutCardIds.push(cardId);
  }
  return {
    allReady: cardIds.length > 0 && readyCardIds.length === cardIds.length,
    statuses,
    readyCardIds,
    failedCardIds,
    timedOutCardIds,
  };
}

function isTerminalStatus(status: AgentRendererStatus): boolean {
  return status === "ready" || status === "error" || status === "timeout";
}

function settleReadinessWaiters(): void {
  for (const waiter of [...readinessWaiters]) {
    if (!waiter.cardIds.every((cardId) => isTerminalStatus(statusForCard(cardId)))) continue;
    clearTimeout(waiter.timer);
    readinessWaiters.delete(waiter);
    waiter.resolve(buildReadiness(waiter.cardIds));
  }
}

function beginRendererReadiness(cardIds: readonly string[]): void {
  for (const cardId of cardIds) rendererReadiness.set(cardId, { status: "pending" });
  settleReadinessWaiters();
}

/** Records the renderer acknowledgement for one newly presented card. */
export function acknowledgeAgentRendererReady(cardId: string): void {
  if (!isNonEmptyString(cardId)) return;
  rendererReadiness.set(cardId, { status: "ready" });
  settleReadinessWaiters();
}

/** Records a bounded, non-throwing renderer failure for one presented card. */
export function acknowledgeAgentRendererError(cardId: string, message?: string): void {
  if (!isNonEmptyString(cardId)) return;
  rendererReadiness.set(cardId, { status: "error", message });
  settleReadinessWaiters();
}

export function forgetAgentRendererReadiness(cardIds: readonly string[]): void {
  for (const cardId of cardIds) rendererReadiness.delete(cardId);
}

export function waitForAgentRendererReadiness(
  cardIds: readonly string[],
  timeoutMs = DEFAULT_RENDERER_READY_TIMEOUT_MS,
): Promise<AgentRendererReadiness> {
  const boundedTimeout = clampReadyTimeout(timeoutMs);
  if (cardIds.length === 0) return Promise.resolve(buildReadiness(cardIds));
  if (cardIds.every((cardId) => isTerminalStatus(statusForCard(cardId)))) {
    return Promise.resolve(buildReadiness(cardIds));
  }

  return new Promise((resolve) => {
    const waiter: ReadinessWaiter = {
      cardIds: [...cardIds],
      resolve,
      timer: setTimeout(() => {
        for (const cardId of cardIds) {
          if (statusForCard(cardId) === "pending" || statusForCard(cardId) === "unknown") {
            rendererReadiness.set(cardId, { status: "timeout" });
          }
        }
        readinessWaiters.delete(waiter);
        resolve(buildReadiness(cardIds));
      }, boundedTimeout),
    };
    readinessWaiters.add(waiter);
    settleReadinessWaiters();
  });
}

function toProtocolGroup(groupId: string): CanvasGroup {
  const group = getFrameGroup(groupId);
  return {
    id: groupId,
    label: (group?.kind === "agent" ? group.label : ""),
    owner: "agent",
    routes: (group?.kind === "agent" ? group.routes : []).map((route) => ({
      url: route.url,
      ...(route.title === undefined || route.title === null ? {} : { title: route.title }),
      ...(route.label === undefined ? {} : { label: route.label }),
    })),
  };
}

function groupCardIds(groupId: string): string[] {
  return getCanvasCards()
    .filter((card) => card.groupId === groupId)
    .map((card) => card.id);
}

/** Returns the compact state shape shared with the companion bridge. */
export function readCanvasState(): CanvasState {
  const focusedCardId = getFocusedCardId();
  const focusedCard = focusedCardId
    ? getCanvasCards().find((card) => card.id === focusedCardId)
    : undefined;
  return {
    mode: getCanvasMode(),
    groups: getFrameGroups().filter((group) => group.kind === "agent").map((group) => group.id)
      .filter((groupId) => groupCardIds(groupId).length > 0)
      .map(toProtocolGroup),
    focusedGroupId: focusedCard?.groupId && getFrameGroup(focusedCard.groupId)?.kind === "agent"
      ? focusedCard.groupId
      : null,
    focusedRouteUrl: focusedCard ? contentSourceUrl(focusedCard.content) : null,
  };
}

export async function presentAgentRoutes(
  input: PresentAgentRoutesInput,
): Promise<AgentRoutesPresentation> {
  ensureDevelopment();
  ensureWritable();
  if (activePresentation) {
    throw new AgentPresentationError("busy", "Another Canvas presentation is still waiting for renderers.");
  }
  activePresentation = true;
  try {
    const label = validateLabel(input.label);
    const routes = normalizeRoutes(input);
    const agentId = input.agentId ?? DEFAULT_AGENT_ID;
    if (!isNonEmptyString(agentId)) {
      throw new AgentPresentationError("invalid-command", "An agent identity is required.");
    }
    const groupId = input.groupId ?? createGroupId();
    if (!isNonEmptyString(groupId) || groupId.length > AGENT_PROTOCOL_LIMITS.groupId) {
      throw new AgentPresentationError("invalid-command", "A route group ID is required.");
    }
    // Rejects reuse of an id that already groups frames on the canvas, whether
    // from this bridge or from a user-created linked group.
    const collides = getFrameGroup(groupId) !== undefined
      || getCanvasCards().some((card) => card.groupId === groupId);
    if (collides) {
      throw new AgentPresentationError("group-id-conflict", `Route group ${groupId} already exists.`);
    }

    const readyTimeoutMs = clampReadyTimeout(input.readyTimeoutMs);
    // Opening Canvas for an agent group appends only the requested routes. It
    // never creates or repositions the current Inspect route.
    setCanvasMode("canvas");
    const cards = batchCanvasChanges(() => {
      setFrameGroup({ id: groupId, kind: "agent", label, agentId, routes: routes.map((route) => ({ ...route })) });
      return appendLinkedGroupCards(
      groupId,
      routes.map((route) => ({
        url: route.url,
        ...(route.title === undefined ? {} : { title: route.title }),
      })),
      );
    });
    if (!cards) {
      throw new AgentPresentationError("group-id-conflict", `Route group ${groupId} already exists.`);
    }
    const cardIds = cards.map((card) => card.id);
    beginRendererReadiness(cardIds);
    const readiness = await waitForAgentRendererReadiness(cardIds, readyTimeoutMs);
    return { group: toProtocolGroup(groupId), cards, readiness };
  } finally {
    activePresentation = false;
  }
}

function groupCards(groupId: string): CanvasCard[] {
  const group = getFrameGroup(groupId);
  if (group?.kind !== "agent") throw new AgentPresentationError("group-not-found", `Route group ${groupId} was not found.`);
  const cards = getCanvasCards().filter((card) => card.groupId === groupId);
  if (cards.length === 0) {
    throw new AgentPresentationError("group-not-found", `Route group ${groupId} has no cards.`);
  }
  return cards;
}

export function focusAgentGroup(
  groupId: string,
  viewport?: { width: number; height: number },
): AgentPresentationState {
  ensureDevelopment();
  ensureWritable();
  const cards = groupCards(groupId);
  focusCard(cards[0]!.id);
  focusCanvasCards(cards.map((card) => card.id), viewport);
  return readCanvasState();
}

export function fitAgentCanvas(
  viewport?: { width: number; height: number },
): AgentPresentationState {
  ensureDevelopment();
  ensureWritable();
  fitAllCards(viewport);
  return readCanvasState();
}

export function removeOwnAgentGroup(
  groupId: string,
  agentId = DEFAULT_AGENT_ID,
): AgentPresentationState {
  ensureDevelopment();
  ensureWritable();
  const group = getFrameGroup(groupId);
  if (group?.kind !== "agent") throw new AgentPresentationError("group-not-found", `Route group ${groupId} was not found.`);
  if (group.agentId !== agentId) {
    throw new AgentPresentationError(
      "not-group-owner",
      `Agent ${agentId} cannot remove route group ${groupId}.`,
    );
  }
  const cardIds = groupCardIds(groupId);
  for (const cardId of cardIds) removeCanvasCard(cardId);
  removeFrameGroup(groupId);
  forgetAgentRendererReadiness(cardIds);
  return readCanvasState();
}

/** The only command vocabulary accepted by the browser presentation adapter. */
export type AgentPresentationCommand = CanvasCommand;

export type AgentPresentationCommandResponse = CanvasCommandResult;

export interface AgentPresentationAdapterOptions {
  projectId?: string;
  /** Internal pairing identity used to enforce remove-own semantics. */
  agentId?: string;
}

export interface AgentPresentationCommandPort {
  /** Direct unit/host hook; it returns the shared acknowledgement body. */
  execute(command: unknown): Promise<CanvasCommandResult>;
  dispose(): void;
}

function commandIdFrom(value: unknown): string {
  if (isRecord(value) && typeof value.commandId === "string" && value.commandId.length > 0) {
    return value.commandId;
  }
  return "unknown";
}

function asPresentationError(error: unknown): AgentPresentationError {
  if (error instanceof AgentPresentationError) return error;
  return new AgentPresentationError(
    "invalid-command",
    error instanceof Error ? error.message : "Invalid Canvas command.",
  );
}

function failure(commandId: string, error: AgentPresentationError): CanvasCommandResult {
  return {
    commandId,
    ok: false,
    error: { code: error.code, message: error.message },
  };
}

function parseCanvasCommand(value: unknown): CanvasCommand {
  if (!isCanvasCommand(value)) {
    throw new AgentPresentationError("invalid-command", "The value is not a shared Canvas command.");
  }
  return value;
}

async function executeCanvasCommand(command: CanvasCommand, agentId: string): Promise<CanvasCommandResult> {
  switch (command.type) {
    case "read-state":
      ensureDevelopment();
      return { commandId: command.commandId, ok: true, state: readCanvasState() };
    case "present-routes": {
      const presentation = await presentAgentRoutes({
        groupId: command.groupId,
        label: command.label,
        routes: command.routes,
        agentId,
      });
      const state = readCanvasState();
      if (presentation.readiness.allReady) {
        return {
          commandId: command.commandId,
          ok: true,
          state,
          group: presentation.group,
        };
      }
      const failed = presentation.readiness.failedCardIds.length > 0;
      return {
        commandId: command.commandId,
        ok: false,
        state,
        group: presentation.group,
        error: {
          code: failed ? "renderer-error" : "renderer-timeout",
          message: failed
            ? "One or more presented routes failed to become ready."
            : "One or more presented routes did not become ready before the bounded timeout.",
        },
      };
    }
    case "focus-group":
      return {
        commandId: command.commandId,
        ok: true,
        state: focusAgentGroup(command.groupId),
      };
    case "fit-all":
      return {
        commandId: command.commandId,
        ok: true,
        state: fitAgentCanvas(),
      };
    case "remove-group":
      return {
        commandId: command.commandId,
        ok: true,
        state: removeOwnAgentGroup(command.groupId, agentId),
      };
  }
}

function credentialsFrom(options: AgentPresentationAdapterOptions): PresentationCredentials {
  return {
    projectId: options.projectId ?? currentProjectId(),
    agentId: options.agentId ?? DEFAULT_AGENT_ID,
  };
}

/**
 * Creates the browser-controller adapter consumed by the inspector's
 * CopyPromptButton. It does not install window events or define a second
 * message protocol; callers pass the plain shared CanvasCommand they received.
 */
export function createAgentPresentationAdapter(
  options: AgentPresentationAdapterOptions = {},
): AgentPresentationCommandPort {
  const credentials = credentialsFrom(options);
  let disposed = false;

  return {
    async execute(command: unknown): Promise<CanvasCommandResult> {
      const commandId = commandIdFrom(command);
      try {
        if (disposed) throw new AgentPresentationError("invalid-command", "The Canvas command adapter is disposed.");
        const parsed = parseCanvasCommand(command);
        return await executeCanvasCommand(parsed, credentials.agentId);
      } catch (error) {
        return failure(commandId, asPresentationError(error));
      }
    },

    dispose(): void {
      disposed = true;
    },
  };
}

/** Clears presentation-only state between browser sessions and unit tests. */
export function resetAgentPresentationState(): void {
  for (const waiter of readinessWaiters) clearTimeout(waiter.timer);
  readinessWaiters.clear();
  rendererReadiness.clear();
  activePresentation = false;
  generatedGroupId = 0;
}
