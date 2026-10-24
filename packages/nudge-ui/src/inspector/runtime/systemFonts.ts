import { useEffect, useSyncExternalStore } from "react";

/** Browser permission states, plus `"unavailable"` where the source cannot list fonts at all. */
export type SystemFontAccess = "granted" | "prompt" | "denied" | "unavailable";

/** Lists the font families installed on this device. */
export interface SystemFontSource {
  /** `"prompt"` waits for the user to ask before `families` runs. */
  access(): Promise<SystemFontAccess>;
  /** Runs when a font list opens with access granted, or synchronously inside the user's request otherwise, so a browser prompt sees the user gesture. */
  families(): Promise<readonly string[]>;
}

export type SystemFontsState =
  | { readonly status: "idle" | "checking" | "unavailable" | "prompt" | "loading" | "denied" }
  | { readonly status: "ready"; readonly families: readonly string[] };

interface LocalFontData {
  readonly family: string;
}

type LocalFontWindow = Window & { queryLocalFonts?: () => Promise<readonly LocalFontData[]> };

/** Chrome's Local Font Access API; the browser asks once per origin and remembers the answer. */
export function localFontAccessSource(win: Window = window): SystemFontSource {
  // SAFETY: the API member is optional and checked before every call.
  const scope = win as LocalFontWindow;
  return {
    async access() {
      if (typeof scope.queryLocalFonts !== "function") return "unavailable";
      try {
        // SAFETY: TypeScript's DOM types omit this name; browsers that do not know it reject the query.
        return (await win.navigator.permissions.query({ name: "local-fonts" as PermissionName })).state;
      } catch {
        // Without a queryable permission, the call itself decides whether to prompt.
        return "prompt";
      }
    },
    async families() {
      const query = scope.queryLocalFonts;
      if (!query) return [];
      return (await query.call(win)).map((font) => font.family);
    },
  };
}

const IDLE: SystemFontsState = { status: "idle" };

let configured: SystemFontSource | null = null;
let state: SystemFontsState = IDLE;
// Discards answers from a source that was replaced while they were pending.
let generation = 0;
const listeners = new Set<() => void>();

/** Replaces the Local Font Access API, for example with the extension's font list. */
export function configureSystemFontSource(source: SystemFontSource | null): void {
  configured = source;
  generation++;
  setState(IDLE);
}

function source(): SystemFontSource {
  return configured ?? localFontAccessSource();
}

function setState(next: SystemFontsState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): SystemFontsState {
  return state;
}

/** Checks access once per source and loads without asking when access is already granted. */
function prepareSystemFonts(): void {
  if (state.status !== "idle") return;
  const run = generation;
  const current = source();
  setState({ status: "checking" });
  void current.access().catch((): SystemFontAccess => "unavailable").then((access) => {
    if (run !== generation) return;
    if (access === "granted") void load(run, current);
    else setState({ status: access });
  });
}

/** Call from the user's gesture: a browser permission prompt needs it. */
export function requestSystemFonts(): void {
  if (state.status !== "prompt") return;
  void load(generation, source());
}

async function load(run: number, current: SystemFontSource): Promise<void> {
  setState({ status: "loading" });
  try {
    const families = normalizeFamilies(await current.families());
    if (run === generation) setState({ status: "ready", families });
  } catch (error) {
    if (run !== generation) return;
    console.warn("[nudge-ui] Could not list the system fonts.", error);
    // A refusal stays hidden; a timeout or other failure offers the request row again.
    const access = await current.access().catch((): SystemFontAccess => "unavailable");
    if (run !== generation) return;
    setState({ status: access === "denied" || access === "unavailable" ? access : "prompt" });
  }
}

function normalizeFamilies(names: readonly string[]): string[] {
  const families = new Set<string>();
  for (const name of names) {
    const family = name.trim();
    // Hidden macOS faces such as ".SF NS" cannot be selected by name in CSS.
    if (family && !family.startsWith(".")) families.add(family);
  }
  return Array.from(families).sort((a, b) => a.localeCompare(b));
}

/** Subscribes to the shared font list; an active list checks access on first use. */
export function useSystemFonts(active: boolean): SystemFontsState {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (active) prepareSystemFonts();
  }, [active, current]);
  return current;
}

const RESERVED_FAMILY_NAMES = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif",
  "ui-monospace", "ui-rounded", "math", "emoji", "fangsong", "inherit", "initial", "unset", "revert",
  "revert-layer", "default",
]);
const CSS_IDENTIFIER = /^-?[_a-z\u00a0-\uffff][-_a-z0-9\u00a0-\uffff]*$/i;

/** Leaves a single plain identifier bare and quotes every other family name. */
export function cssFontFamilyName(family: string): string {
  const bare = CSS_IDENTIFIER.test(family) && !family.startsWith("--") && !RESERVED_FAMILY_NAMES.has(family.toLowerCase());
  return bare ? family : `"${family.replace(/["\\]/g, "\\$&")}"`;
}
