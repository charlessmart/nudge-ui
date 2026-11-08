/** The agent-written map of an application's flows, one `nudge/flows/*.json` file per flow. */
export const NUDGE_FLOWS_DIRECTORY = "nudge/flows";
/** What the browser last saw when it replayed each state; agents read this to repair a recipe. */
export const NUDGE_FLOWS_STATUS_FILE = ".nudge/flows-status.json";
/** Marks a frame's `window.name` as carrying a scenario. Spelled out again in the serialized head script. */
export const FLOW_SCENARIO_NAME_PREFIX = "nudge-ui-flow-state:";

export interface FlowLocator {
  readonly role?: string;
  readonly name?: string;
  readonly text?: string;
  readonly selector?: string;
  readonly testId?: string;
}

export type FlowStep =
  | { readonly click: FlowLocator }
  | { readonly hover: FlowLocator }
  | { readonly fill: FlowLocator; readonly value: string }
  | { readonly select: FlowLocator; readonly value: string }
  | { readonly press: string; readonly on?: FlowLocator }
  | { readonly waitFor: FlowLocator; readonly timeoutMs?: number }
  | { readonly waitMs: number };

export interface FlowNetworkRule {
  /** `METHOD /path`; `*` matches any run of characters and a missing method matches every method. */
  readonly match: string;
  readonly status?: number;
  readonly json?: unknown;
  readonly text?: string;
  readonly delayMs?: number;
  /** Never answers, which keeps a loading state on screen. */
  readonly hold?: boolean;
  /** Lets a request reach the server, which is how a read-only POST such as GraphQL opts out of blocking. */
  readonly passthrough?: boolean;
}

export interface FlowSeed {
  readonly localStorage?: Readonly<Record<string, string>>;
  readonly sessionStorage?: Readonly<Record<string, string>>;
}

/** What a frame needs before the application's first script runs. */
export interface FlowScenario {
  readonly seed?: FlowSeed;
  readonly network?: readonly FlowNetworkRule[];
  readonly allowMutations?: boolean;
  /**
   * Storage keys the frame must not inherit from the developer's own session, `*` matching any run of characters.
   * A seed is applied after hiding, so a hidden key can be given a fixture value. `["*"]` starts the frame empty.
   */
  readonly hideStorage?: readonly string[];
  /** Lets the frame open WebSocket and EventSource connections to other origins, which are held open-ended otherwise. */
  readonly allowRealtime?: boolean;
}

export interface FlowState extends FlowScenario {
  readonly id: string;
  readonly label: string;
  readonly tag?: string;
  readonly route: string;
  /** The path the frame is expected to end on when the route redirects on purpose, such as a signed-out visit to /chat. */
  readonly expectRoute?: string;
  readonly steps?: readonly FlowStep[];
}

export interface FlowEdge {
  readonly from: string;
  readonly to: string;
}

export interface FlowDefinition {
  readonly version: 1;
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly states: readonly FlowState[];
  readonly edges: readonly FlowEdge[];
}

export interface FlowStateStatus {
  readonly flowId: string;
  readonly stateId: string;
  readonly ok: boolean;
  readonly at: number;
  readonly durationMs: number;
  /** Zero-based index of the step that failed. */
  readonly failedStep?: number;
  readonly message?: string;
  /** Writes the frame stopped from reaching the server, as `METHOD url`. */
  readonly blocked: readonly string[];
  /** Mock rules, as written, that matched no request before the result was taken. */
  readonly unusedRules?: readonly string[];
  /** Reads that reached a real server, as `METHOD url`, so a state that depends on live data can be seen. */
  readonly passedThrough?: readonly string[];
  /** Relative rules that matched a request to another host, as `rule -> METHOD url`. */
  readonly foreignMatches?: readonly string[];
  /** Realtime connections held open-ended instead of reaching a server, as `WebSocket url` or `EventSource url`. */
  readonly heldConnections?: readonly string[];
}

export interface FlowsResponse {
  readonly flows: readonly FlowDefinition[];
  /** Files that could not be used, so the panel and the agent can see why. */
  readonly errors: readonly { readonly file: string; readonly message: string }[];
  readonly status: readonly FlowStateStatus[];
}

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_STATES = 64;
const MAX_STEPS = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class FlowError extends Error {}

function fail(path: string, message: string): never {
  throw new FlowError(`${path}: ${message}`);
}

function text(value: unknown, path: string, max = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) fail(path, `must be a string of 1-${max} characters`);
  return value;
}

function optionalText(value: unknown, path: string, max = 512): string | undefined {
  return value === undefined ? undefined : text(value, path, max);
}

function positive(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(path, "must be a non-negative number");
  return value;
}

function locator(value: unknown, path: string): FlowLocator {
  if (!isRecord(value)) fail(path, "must be a locator object");
  const parsed = {
    ...(value.role !== undefined ? { role: text(value.role, `${path}.role`) } : {}),
    ...(value.name !== undefined ? { name: text(value.name, `${path}.name`) } : {}),
    ...(value.text !== undefined ? { text: text(value.text, `${path}.text`) } : {}),
    ...(value.selector !== undefined ? { selector: text(value.selector, `${path}.selector`) } : {}),
    ...(value.testId !== undefined ? { testId: text(value.testId, `${path}.testId`) } : {}),
  };
  if (!parsed.role && !parsed.text && !parsed.selector && !parsed.testId) fail(path, "needs role, text, selector or testId");
  return parsed;
}

function step(value: unknown, path: string): FlowStep {
  if (!isRecord(value)) fail(path, "must be an object");
  if (value.click !== undefined) return { click: locator(value.click, `${path}.click`) };
  if (value.hover !== undefined) return { hover: locator(value.hover, `${path}.hover`) };
  if (value.fill !== undefined) {
    if (typeof value.value !== "string") fail(`${path}.value`, "must be a string");
    return { fill: locator(value.fill, `${path}.fill`), value: value.value };
  }
  if (value.select !== undefined) {
    if (typeof value.value !== "string") fail(`${path}.value`, "must be a string");
    return { select: locator(value.select, `${path}.select`), value: value.value };
  }
  if (value.press !== undefined) {
    return { press: text(value.press, `${path}.press`, 64), ...(value.on !== undefined ? { on: locator(value.on, `${path}.on`) } : {}) };
  }
  if (value.waitFor !== undefined) {
    return {
      waitFor: locator(value.waitFor, `${path}.waitFor`),
      ...(value.timeoutMs !== undefined ? { timeoutMs: positive(value.timeoutMs, `${path}.timeoutMs`) } : {}),
    };
  }
  if (value.waitMs !== undefined) return { waitMs: positive(value.waitMs, `${path}.waitMs`) };
  return fail(path, "needs click, hover, fill, select, press, waitFor or waitMs");
}

function strings(value: unknown, path: string): Record<string, string> {
  if (!isRecord(value)) fail(path, "must map keys to strings");
  for (const [key, item] of Object.entries(value)) if (typeof item !== "string") fail(`${path}.${key}`, "must be a string");
  return value as Record<string, string>;
}

function networkRule(value: unknown, path: string): FlowNetworkRule {
  if (!isRecord(value)) fail(path, "must be an object");
  const status = value.status === undefined ? undefined : positive(value.status, `${path}.status`);
  if (status !== undefined && (status < 200 || status > 599)) fail(`${path}.status`, "must be between 200 and 599");
  return {
    match: text(value.match, `${path}.match`, 2048),
    ...(status !== undefined ? { status } : {}),
    ...(value.json !== undefined ? { json: value.json } : {}),
    ...(value.text !== undefined ? { text: String(value.text) } : {}),
    ...(value.delayMs !== undefined ? { delayMs: positive(value.delayMs, `${path}.delayMs`) } : {}),
    ...(value.hold === true ? { hold: true } : {}),
    ...(value.passthrough === true ? { passthrough: true } : {}),
  };
}

function state(value: unknown, path: string): FlowState {
  if (!isRecord(value)) fail(path, "must be an object");
  const id = text(value.id, `${path}.id`, 64);
  if (!ID.test(id)) fail(`${path}.id`, "must be lowercase letters, digits and hyphens");
  const route = text(value.route, `${path}.route`, 2048);
  if (!route.startsWith("/") || route.startsWith("//")) fail(`${path}.route`, "must be a same-origin path starting with /");
  const seed = value.seed;
  if (seed !== undefined && !isRecord(seed)) fail(`${path}.seed`, "must be an object");
  if (value.steps !== undefined && (!Array.isArray(value.steps) || value.steps.length > MAX_STEPS)) fail(`${path}.steps`, `must be a list of at most ${MAX_STEPS}`);
  if (value.network !== undefined && !Array.isArray(value.network)) fail(`${path}.network`, "must be a list");
  const tag = optionalText(value.tag, `${path}.tag`, 32);
  const expectRoute = optionalText(value.expectRoute, `${path}.expectRoute`, 2048);
  if (expectRoute !== undefined && (!expectRoute.startsWith("/") || expectRoute.startsWith("//"))) fail(`${path}.expectRoute`, "must be a same-origin path starting with /");
  if (value.hideStorage !== undefined && (!Array.isArray(value.hideStorage) || value.hideStorage.length > 32)) fail(`${path}.hideStorage`, "must be a list of at most 32 key patterns");
  const hideStorage = (value.hideStorage as unknown[] | undefined)?.map((item, index) => text(item, `${path}.hideStorage[${index}]`, 256));
  return {
    id,
    label: text(value.label, `${path}.label`, 128),
    ...(tag ? { tag } : {}),
    route,
    ...(expectRoute ? { expectRoute } : {}),
    ...(hideStorage && hideStorage.length > 0 ? { hideStorage } : {}),
    ...(value.allowRealtime === true ? { allowRealtime: true } : {}),
    ...(seed ? {
      seed: {
        ...(seed.localStorage !== undefined ? { localStorage: strings(seed.localStorage, `${path}.seed.localStorage`) } : {}),
        ...(seed.sessionStorage !== undefined ? { sessionStorage: strings(seed.sessionStorage, `${path}.seed.sessionStorage`) } : {}),
      },
    } : {}),
    ...(value.network ? { network: (value.network as unknown[]).map((rule, index) => networkRule(rule, `${path}.network[${index}]`)) } : {}),
    ...(value.allowMutations === true ? { allowMutations: true } : {}),
    ...(value.steps ? { steps: (value.steps as unknown[]).map((item, index) => step(item, `${path}.steps[${index}]`)) } : {}),
  };
}

/** Validates one flow file, returning the first problem as a message an agent can act on. */
export function parseFlowDefinition(value: unknown): { flow: FlowDefinition } | { error: string } {
  try {
    if (!isRecord(value)) fail("flow", "must be an object");
    if (value.version !== 1) fail("version", "must be 1");
    const id = text(value.id, "id", 64);
    if (!ID.test(id)) fail("id", "must be lowercase letters, digits and hyphens");
    if (!Array.isArray(value.states) || value.states.length === 0 || value.states.length > MAX_STATES) fail("states", `must list 1-${MAX_STATES} states`);
    const states = value.states.map((item, index) => state(item, `states[${index}]`));
    const ids = new Set(states.map((item) => item.id));
    if (ids.size !== states.length) fail("states", "ids must be unique");
    if (value.edges !== undefined && !Array.isArray(value.edges)) fail("edges", "must be a list");
    const edges = ((value.edges ?? []) as unknown[]).map((item, index): FlowEdge => {
      if (!isRecord(item)) fail(`edges[${index}]`, "must be an object");
      const from = text(item.from, `edges[${index}].from`, 64);
      const to = text(item.to, `edges[${index}].to`, 64);
      if (!ids.has(from)) fail(`edges[${index}].from`, `no state "${from}"`);
      if (!ids.has(to)) fail(`edges[${index}].to`, `no state "${to}"`);
      return { from, to };
    });
    const viewport = value.viewport;
    if (viewport !== undefined && (!isRecord(viewport) || !(positive(viewport.width, "viewport.width") > 0) || !(positive(viewport.height, "viewport.height") > 0))) {
      fail("viewport", "needs a positive width and height");
    }
    const description = optionalText(value.description, "description", 1024);
    return {
      flow: {
        version: 1,
        id,
        title: text(value.title, "title", 128),
        ...(description ? { description } : {}),
        ...(viewport ? { viewport: { width: (viewport as { width: number }).width, height: (viewport as { height: number }).height } } : {}),
        states,
        edges,
      },
    };
  } catch (error) {
    if (error instanceof FlowError) return { error: error.message };
    throw error;
  }
}

/** Accepts one replay result posted by the browser. */
export function parseFlowStateStatus(value: unknown): FlowStateStatus | null {
  if (!isRecord(value)) return null;
  const { flowId, stateId, ok, at, durationMs, failedStep, message, blocked } = value;
  if (typeof flowId !== "string" || !ID.test(flowId) || typeof stateId !== "string" || !ID.test(stateId)) return null;
  if (typeof ok !== "boolean" || typeof at !== "number" || typeof durationMs !== "number") return null;
  const list = (input: unknown): string[] | null | undefined => {
    if (input === undefined) return undefined;
    return Array.isArray(input) && input.length <= 256 && input.every((item) => typeof item === "string" && item.length <= 2048) ? input as string[] : null;
  };
  if (!Array.isArray(blocked) || blocked.length > 256 || !blocked.every((item) => typeof item === "string" && item.length <= 2048)) return null;
  const extras = {
    unusedRules: list(value.unusedRules),
    passedThrough: list(value.passedThrough),
    foreignMatches: list(value.foreignMatches),
    heldConnections: list(value.heldConnections),
  };
  const present = Object.entries(extras);
  if (present.some(([, item]) => item === null)) return null;
  return {
    flowId,
    stateId,
    ok,
    at,
    durationMs,
    ...(typeof failedStep === "number" ? { failedStep } : {}),
    ...(typeof message === "string" ? { message: message.slice(0, 2048) } : {}),
    blocked: blocked as string[],
    ...Object.fromEntries(present.filter(([, item]) => item && item.length > 0)),
  };
}

/**
 * Drops results for states no file defines any more, so an agent reading the status file is not shown a failure it
 * already fixed by deleting the state. With no flow readable at all, or a file that failed to parse, nothing is
 * dropped: the folder may be mid-write, and a broken file's flow is unknown.
 */
export function pruneFlowStatus(status: readonly FlowStateStatus[], flows: readonly FlowDefinition[], hasErrors: boolean): FlowStateStatus[] {
  if (flows.length === 0) return [...status];
  const states = new Map(flows.map((flow) => [flow.id, new Set(flow.states.map((item) => item.id))]));
  return status.filter((item) => {
    const known = states.get(item.flowId);
    return known ? known.has(item.stateId) : hasErrors;
  });
}

export function flowScenarioName(scenario: FlowScenario): string {
  return `${FLOW_SCENARIO_NAME_PREFIX}${JSON.stringify(scenario)}`;
}
