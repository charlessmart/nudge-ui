// `installFlowScenario` is serialized into the page by the hosts, so it must stay self-contained: no imports, no module
// values, no helpers outside its own body.

/** Where the installed scenario lives on the frame's window. */
export const FLOW_SCENARIO_GLOBAL = "__nudgeUiFlowScenario";

export interface InstalledFlowScenario {
  /** Writes stopped from reaching the server, as `METHOD url`. */
  readonly blocked: string[];
  /** Requests that reached a real server, as `METHOD path` for the application's own origin and `METHOD url` otherwise. */
  readonly passed: string[];
  /** Relative rules that matched another host's request, as `rule -> METHOD url`. */
  readonly foreign: string[];
  /** Realtime connections held open-ended, as `WebSocket url` or `EventSource url`. */
  readonly held: string[];
  /** Every mock rule as written with how many requests it answered. */
  readonly rules: { match: string; hits: number }[];
}

/**
 * Gives one Canvas frame the world its flow state needs, before the application's first script runs. The scenario
 * arrives in `window.name`, which the frame's URL and draft identity never see and which survives its reloads.
 * Storage is copied on read so sign-ins keep working while writes stay inside this frame, and any write the scenario
 * did not mock is blocked: replaying a recipe must never pay, delete or send anything on a real development backend.
 * A document without a scenario in its name is untouched.
 */
export function installFlowScenario(win: Window): void {
  const scope = win as unknown as Record<string, unknown> & Window & typeof globalThis;
  const prefix = "nudge-ui-flow-state:";
  if (!win.name.startsWith(prefix) || scope.__nudgeUiFlowScenario) return;
  interface Rule { match: string; status?: number; json?: unknown; text?: string; delayMs?: number; hold?: boolean; passthrough?: boolean }
  interface Scenario { seed?: { localStorage?: Record<string, string>; sessionStorage?: Record<string, string> }; network?: Rule[]; allowMutations?: boolean; hideStorage?: string[]; allowRealtime?: boolean }
  let scenario: Scenario;
  try {
    scenario = JSON.parse(win.name.slice(prefix.length)) as Scenario;
  } catch {
    return;
  }
  const blocked: string[] = [];
  const passed: string[] = [];
  const foreign: string[] = [];
  const held: string[] = [];
  const ruleHits = (scenario.network ?? []).map((rule) => ({ match: rule.match, hits: 0 }));
  scope.__nudgeUiFlowScenario = { blocked, passed, foreign, held, rules: ruleHits };
  const note = (list: string[], entry: string): void => { if (list.length < 64 && !list.includes(entry)) list.push(entry); };
  const glob = (pattern: string): RegExp => new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
  const hidden = (scenario.hideStorage ?? []).map(glob);

  for (const area of ["localStorage", "sessionStorage"] as const) {
    let real: Storage;
    try { real = win[area]; } catch { continue; }
    const values = new Map<string, string>();
    for (let index = 0; index < real.length; index += 1) {
      const key = real.key(index);
      if (key !== null) values.set(key, real.getItem(key) ?? "");
    }
    // The inspector's own settings stay shared with the real store.
    const own = (key: string): boolean => key.startsWith("nudge-ui");
    // The developer's own sign-in is copied in so it keeps working; a state that must be signed out hides it.
    for (const key of [...values.keys()]) if (!own(key) && hidden.some((pattern) => pattern.test(key))) values.delete(key);
    for (const [key, value] of Object.entries(scenario.seed?.[area] ?? {})) values.set(key, value);
    const methods = {
      get length() { return values.size; },
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => own(key) ? real.getItem(key) : values.get(String(key)) ?? null,
      setItem: (key: string, value: string) => { if (own(key)) real.setItem(key, value); else values.set(String(key), String(value)); },
      removeItem: (key: string) => { if (own(key)) real.removeItem(key); else values.delete(String(key)); },
      clear: () => values.clear(),
    };
    const partition = new Proxy(methods, {
      get: (target, key) => typeof key === "string" && !(key in target) ? values.get(key) : Reflect.get(target, key),
      set: (target, key, value: string) => { if (typeof key === "string") target.setItem(key, value); return true; },
      has: (target, key) => key in target || values.has(String(key)),
      deleteProperty: (target, key) => { target.removeItem(String(key)); return true; },
      ownKeys: () => [...values.keys()],
      getOwnPropertyDescriptor: (_target, key) => typeof key === "string" && values.has(key)
        ? { configurable: true, enumerable: true, writable: true, value: values.get(key) }
        : undefined,
    });
    try { Object.defineProperty(win, area, { configurable: true, get: () => partition }); } catch { /* The application keeps the real store. */ }
  }

  const rules = (scenario.network ?? []).map((rule, index) => {
    const parsed = /^([A-Za-z]+)\s+(.+)$/.exec(rule.match);
    const method = parsed?.[1]?.toUpperCase() ?? null;
    const pattern = parsed?.[2] ?? rule.match;
    return { rule, index, method, absolute: /^[a-z]+:/i.test(pattern), query: pattern.includes("?"), test: glob(pattern) };
  });
  // The dev server's own modules and hot-update requests are not the application's data.
  const toolingPath = /^\/(?:@|__nudge_ui__\/|node_modules\/|src\/|_next\/|__nextjs|_astro\/)/;
  const passes = (method: string, url: URL): Decision => {
    if (/^https?:$/.test(url.protocol) && !(url.origin === win.location.origin && toolingPath.test(url.pathname))) {
      note(passed, `${method} ${url.origin === win.location.origin ? `${url.pathname}${url.search}` : url.href}`);
    }
    return { kind: "pass" };
  };
  type Decision = { kind: "pass" } | { kind: "block" } | { kind: "rule"; rule: Rule };
  const decide = (method: string, rawUrl: string): Decision => {
    let url: URL;
    try { url = new URL(rawUrl, win.location.href); } catch { return { kind: "pass" }; }
    for (const entry of rules) {
      if (entry.method && entry.method !== method) continue;
      const subject = entry.absolute ? url.href : `${url.pathname}${entry.query ? url.search : ""}`;
      if (!entry.test.test(subject)) continue;
      ruleHits[entry.index]!.hits += 1;
      if (!entry.absolute && url.origin !== win.location.origin) note(foreign, `${entry.rule.match} -> ${method} ${url.href}`);
      return entry.rule.passthrough ? passes(method, url) : { kind: "rule", rule: entry.rule };
    }
    if (method === "GET" || method === "HEAD" || method === "OPTIONS" || scenario.allowMutations) return passes(method, url);
    if (url.origin === win.location.origin && url.pathname.startsWith("/__nudge_ui__/")) return { kind: "pass" };
    blocked.push(`${method} ${url.href}`);
    return { kind: "block" };
  };
  const BLOCKED_BODY = JSON.stringify({ error: "Blocked by a Nudge flow scenario: mock this request or set allowMutations." });
  const bodyOf = (rule: Rule): string => rule.json !== undefined ? JSON.stringify(rule.json) : rule.text ?? "";
  const typeOf = (rule: Rule): string => rule.json !== undefined ? "application/json" : "text/plain";
  const nullBody = (status: number): boolean => status === 204 || status === 205 || status === 304;

  const realFetch = win.fetch?.bind(win);
  if (realFetch) {
    win.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = typeof input === "object" && "method" in input ? input : null;
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      const decision = decide(method, request ? request.url : String(input));
      if (decision.kind === "pass") return realFetch(input, init);
      if (decision.kind === "block") {
        return Promise.resolve(new Response(BLOCKED_BODY, { status: 503, headers: { "content-type": "application/json" } }));
      }
      const { rule } = decision;
      if (rule.hold) return new Promise<Response>(() => undefined);
      const status = rule.status ?? 200;
      const respond = (): Response => new Response(nullBody(status) ? null : bodyOf(rule), { status, headers: { "content-type": typeOf(rule) } });
      return rule.delayMs
        ? new Promise((resolve) => { win.setTimeout(() => resolve(respond()), rule.delayMs); })
        : Promise.resolve(respond());
    };
  }

  const XhrPrototype = (scope.XMLHttpRequest as typeof XMLHttpRequest | undefined)?.prototype;
  if (XhrPrototype) {
    const targets = new WeakMap<XMLHttpRequest, { method: string; url: string }>();
    const realOpen = XhrPrototype.open;
    const realSend = XhrPrototype.send;
    XhrPrototype.open = function open(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]): void {
      targets.set(this, { method: method.toUpperCase(), url: String(url) });
      (realOpen as (...args: unknown[]) => void).call(this, method, url, ...rest);
    };
    XhrPrototype.send = function send(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
      const target = targets.get(this);
      const decision = target ? decide(target.method, target.url) : { kind: "pass" as const };
      if (decision.kind === "pass") {
        realSend.call(this, body);
        return;
      }
      if (decision.kind === "rule" && decision.rule.hold) return;
      const status = decision.kind === "rule" ? decision.rule.status ?? 200 : 503;
      const text = decision.kind === "rule" ? bodyOf(decision.rule) : BLOCKED_BODY;
      const answer = (): void => {
        for (const [key, value] of Object.entries({ readyState: 4, status, statusText: "", responseText: text, response: this.responseType === "json" ? JSON.parse(text || "null") : text })) {
          Object.defineProperty(this, key, { configurable: true, value });
        }
        for (const type of ["readystatechange", "load", "loadend"]) this.dispatchEvent(new Event(type));
      };
      win.setTimeout(answer, decision.kind === "rule" ? decision.rule.delayMs ?? 0 : 0);
    };
  }

  // A frozen state must not open a live connection with the developer's real credentials. Connections to other origins
  // stay in "connecting" for good, which reads as loading and cannot retry. The page's own origin is left alone because
  // dev-server hot reload and the application's own sockets share it.
  const holdsRealtime = (kind: "WebSocket" | "EventSource", raw: unknown): boolean => {
    if (scenario.allowRealtime) return false;
    let url: URL;
    try { url = new URL(String(raw), win.location.href); } catch { return false; }
    if (url.protocol === "wss:") url.protocol = "https:";
    if (url.protocol === "ws:") url.protocol = "http:";
    if (url.origin === win.location.origin) return false;
    for (const entry of rules) {
      if (!entry.rule.passthrough || (entry.method && entry.method !== "GET")) continue;
      if (!entry.test.test(entry.absolute ? url.href : `${url.pathname}${entry.query ? url.search : ""}`)) continue;
      ruleHits[entry.index]!.hits += 1;
      return false;
    }
    note(held, `${kind} ${String(raw)}`);
    return true;
  };
  const EventTargetBase = (scope as unknown as { EventTarget?: typeof EventTarget }).EventTarget;
  if (EventTargetBase) {
    const stateError = (): Error => {
      const DomError = (scope as unknown as { DOMException?: typeof DOMException }).DOMException;
      return DomError ? new DomError("The connection is still connecting.", "InvalidStateError") : new Error("The connection is still connecting.");
    };
    class HeldConnection extends EventTargetBase {
      readyState = 0;
      readonly url: string;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onclose: ((event: Event) => void) | null = null;
      constructor(url: string) { super(); this.url = url; }
      close(): void {
        if (this.readyState === 3) return;
        this.readyState = 3;
        const event = new Event("close");
        this.dispatchEvent(event);
        this.onclose?.(event);
      }
    }
    class HeldSocket extends HeldConnection {
      readonly protocol = "";
      readonly extensions = "";
      bufferedAmount = 0;
      binaryType: BinaryType = "blob";
      send(): void { throw stateError(); }
    }
    class HeldEventSource extends HeldConnection {
      readonly withCredentials: boolean;
      constructor(url: string, init?: EventSourceInit) { super(url); this.withCredentials = init?.withCredentials === true; }
    }
    const guard = (name: "WebSocket" | "EventSource", Held: new (...args: never[]) => object): void => {
      const Real = (scope as unknown as Record<string, unknown>)[name] as (new (...args: unknown[]) => object) | undefined;
      if (!Real) return;
      const Guarded = new Proxy(Real, {
        construct: (target, args, newTarget) => holdsRealtime(name, args[0])
          ? new (Held as unknown as new (...held: unknown[]) => object)(...args)
          : Reflect.construct(target, args, newTarget),
      });
      try { Object.defineProperty(win, name, { configurable: true, writable: true, value: Guarded }); } catch { /* The application keeps the real constructor. */ }
    };
    guard("WebSocket", HeldSocket);
    guard("EventSource", HeldEventSource);
  }

  const navigatorRef = win.navigator as Navigator | undefined;
  if (navigatorRef?.sendBeacon) {
    const realBeacon = navigatorRef.sendBeacon.bind(navigatorRef);
    navigatorRef.sendBeacon = (url: string | URL, data?: BodyInit | null): boolean =>
      decide("POST", String(url)).kind === "pass" ? realBeacon(url, data) : true;
  }
}

export const FLOW_SCENARIO_SCRIPT = `(${installFlowScenario.toString()})(window);`;
