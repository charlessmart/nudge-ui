import { useEffect, useSyncExternalStore } from "react";
import { type FlowsResponse, type FlowStateStatus } from "../../transport/flows.ts";
import { NUDGE_UI_FLOWS_PATH } from "../../transport/routes.ts";
import { getCanvasCards, syncFlowCards } from "../canvas/canvasStore.ts";
import { flowRouteUrl, flowStateOf, type FlowStateBinding } from "../canvas/frameContent.ts";
import { FLOW_SCENARIO_GLOBAL, type InstalledFlowScenario } from "../canvas/flowScenario.ts";
import { frameLifecycle } from "../canvas/frameLifecycle.ts";
import { replayFlowSteps } from "./replay.ts";

const POLL_MS = 2000;

export type FlowsLoad = "loading" | "ready" | "unavailable";

interface Snapshot extends FlowsResponse {
  readonly load: FlowsLoad;
  /** States whose recipe is running right now, as `flow/state`. */
  readonly replaying: ReadonlySet<string>;
}

const statusKey = (flowId: string, stateId: string): string => `${flowId}/${stateId}`;

let snapshot: Snapshot = { load: "loading", flows: [], errors: [], status: [], replaying: new Set() };
let lastBody = "";
let pollUsers = 0;
let pollTimer: number | null = null;
const listeners = new Set<() => void>();

function publish(next: Partial<Snapshot>): void {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

async function poll(): Promise<void> {
  try {
    const response = await fetch(NUDGE_UI_FLOWS_PATH, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    // A host without the route, such as an older one, has no flows to offer.
    if (!response.ok) {
      if (snapshot.load !== "unavailable") publish({ load: "unavailable" });
      return;
    }
    const body = await response.text();
    if (body === lastBody && snapshot.load === "ready") return;
    lastBody = body;
    const parsed = JSON.parse(body) as FlowsResponse;
    publish({ load: "ready", flows: parsed.flows, errors: parsed.errors, status: parsed.status });
    if (frameLifecycle().canEdit()) syncFlowCards(parsed.flows);
  } catch {
    // A dev server restart should not empty the panel; the next poll recovers.
  }
}

function schedule(): void {
  if (pollTimer !== null || pollUsers === 0) return;
  pollTimer = window.setTimeout(() => {
    pollTimer = null;
    void poll().finally(schedule);
  }, POLL_MS);
}

/** Keeps the flow files read while a component that shows them is mounted. */
export function useFlows(): Snapshot {
  useEffect(() => {
    pollUsers += 1;
    if (pollUsers === 1) void poll();
    schedule();
    return () => {
      pollUsers -= 1;
      if (pollUsers === 0 && pollTimer !== null) {
        window.clearTimeout(pollTimer);
        pollTimer = null;
      }
    };
  }, []);
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

export function flowStatusFor(status: readonly FlowStateStatus[], flowId: string, stateId: string): FlowStateStatus | undefined {
  return status.find((item) => item.flowId === flowId && item.stateId === stateId);
}

function recordResult(result: FlowStateStatus): void {
  publish({
    status: [...snapshot.status.filter((item) => item.flowId !== result.flowId || item.stateId !== result.stateId), result],
  });
  void fetch(`${NUDGE_UI_FLOWS_PATH}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result),
    signal: AbortSignal.timeout(10000),
  }).catch(() => {
    // The frame still shows the result; only the agent's copy is stale.
  });
}

/** Says where a frame ended up when that is not where the state means it to be, so a redirect shows as a failure unless the recipe expects it. */
export function unexpectedRedirect(openedPath: string, binding: Pick<FlowStateBinding, "route" | "expectRoute">, base: string): string | null {
  const expected = new URL(binding.expectRoute ?? binding.route, base).pathname;
  return openedPath === expected ? null : `The frame opened ${openedPath} instead of ${expected}.`;
}

/** What a frame's scenario saw, beyond writes it stopped: rules that never fired, reads that reached a server, and so on. */
function scenarioDiagnostics(installed: InstalledFlowScenario): Partial<FlowStateStatus> {
  const unused = installed.rules.filter((rule) => rule.hits === 0).map((rule) => rule.match);
  return {
    ...(unused.length > 0 ? { unusedRules: unused } : {}),
    ...(installed.passed.length > 0 ? { passedThrough: [...installed.passed] } : {}),
    ...(installed.foreign.length > 0 ? { foreignMatches: [...installed.foreign] } : {}),
    ...(installed.held.length > 0 ? { heldConnections: [...installed.held] } : {}),
  };
}

const RULE_SETTLE_MS = 500;

async function settleRules(win: Window, installed: InstalledFlowScenario): Promise<void> {
  const deadline = Date.now() + RULE_SETTLE_MS;
  while (installed.rules.some((rule) => rule.hits === 0) && Date.now() < deadline) {
    await new Promise<void>((resolve) => { win.setTimeout(resolve, 50); });
  }
}

const replayedDocuments = new WeakSet<Document>();

function wasReloaded(win: Window): boolean {
  const [entry] = win.performance?.getEntriesByType?.("navigation") ?? [];
  return (entry as PerformanceNavigationTiming | undefined)?.type === "reload";
}

/** Runs a flow frame's recipe once per document, so a hot update keeps its state and a reload reaches it again. */
export async function replayCardFlowState(cardId: string, iframe: HTMLIFrameElement): Promise<void> {
  const binding = flowStateOf(getCanvasCards().find((card) => card.id === cardId)?.content);
  const win = iframe.contentWindow;
  const document = iframe.contentDocument;
  if (!binding || !win || !document || replayedDocuments.has(document)) return;
  replayedDocuments.add(document);
  const misplaced = unexpectedRedirect(win.location.pathname, binding, win.location.href);
  // A reload keeps the URL the steps moved the frame to, so start over at the route. The restart is not a reload, so a
  // frame that still lands elsewhere reports the redirect instead of looping.
  if (misplaced && wasReloaded(win)) {
    win.location.replace(flowRouteUrl(binding));
    return;
  }
  const key = statusKey(binding.flowId, binding.stateId);
  publish({ replaying: new Set(snapshot.replaying).add(key) });

  const result = misplaced
    ? { ok: false, durationMs: 0, message: misplaced }
    : await replayFlowSteps(win, binding.steps);
  const installed = (win as Window & { [FLOW_SCENARIO_GLOBAL]?: InstalledFlowScenario })[FLOW_SCENARIO_GLOBAL];
  // The last step can pass on an optimistic screen before the request it starts goes out, so give unused rules a moment.
  if (installed && result.ok) await settleRules(win, installed);
  const replaying = new Set(snapshot.replaying);
  replaying.delete(key);
  publish({ replaying });
  recordResult({
    flowId: binding.flowId,
    stateId: binding.stateId,
    at: Date.now(),
    blocked: installed ? [...installed.blocked] : [],
    ...(installed ? scenarioDiagnostics(installed) : {}),
    ...result,
  });
}
