import type {
  TokenCatalogDiagnostic,
  TokenDefinition,
  TokenEntry,
} from "../../css/model/index.ts";
import type { ComponentContract } from "../componentSemantics/types.ts";

/** The host Adapter that supplied the active inspector runtime. */
export type NudgeUiRuntimeHost =
  | "vite-react"
  | "static-html"
  | "nextjs-react"
  | "astro";

/** The framework semantics enabled for the active inspector runtime. */
export type NudgeUiRuntimeFramework = "React" | "HTML" | "Astro";

/**
 * Which identity origins carry exact authored coordinates in prompts
 * (ADR-0011 Stage 5).
 *
 * A host whose pipeline captures `data-src` positions from anything other
 * than the authored source declares the exact subset. Hosts that omit the
 * policy state that every source site is exact.
 */
export interface SourceCoordinatePolicy {
  /** Cid prefixes whose `data-src` line:column point at authored source. */
  readonly exactCidPrefixes: readonly string[];
  /** File extensions whose `data-src` line:column point at authored source. */
  readonly exactFileExtensions: readonly string[];
}

/** Capabilities exposed by the active host Adapter. */
export interface NudgeUiRuntimeCapabilities {
  /** Whether the multi-page Canvas workspace is available. */
  readonly canvas: boolean;
  /** Whether framework component inspection and prop overrides are available. */
  readonly componentSemantics: boolean;
  /** Whether the DOM navigator overlay is available. */
  readonly domNavigation?: boolean;
  /**
   * Source-coordinate precision policy for prompts; every source site is
   * exact when the host omits it.
   */
  readonly sourceCoordinates?: SourceCoordinatePolicy;
  /**
   * Regex source matching this host's structural scoping markers, stripped
   * from human-facing selector labels (ADR-0011). The raw selector stays in
   * change records so managed-rule targeting keeps matching the rendered
   * DOM. No stripping when the host omits it.
   */
  readonly scopingSelectorPattern?: string;
}

/**
 * Browser knowledge supplied by a host Adapter before the inspector mounts.
 *
 * A host replaces the complete configuration when its document is replaced or
 * its development transport is refreshed. Shared inspector Modules read the
 * current snapshot through `getNudgeUiRuntimeConfig()` and never import a
 * host-specific transport directly.
 */
export interface NudgeUiRuntimeConfig {
  readonly projectId: string;
  readonly host: NudgeUiRuntimeHost;
  readonly framework: NudgeUiRuntimeFramework;
  readonly stylingSystem: string;
  readonly capabilities: NudgeUiRuntimeCapabilities;
  readonly tokenCatalog: readonly TokenDefinition[];
  readonly tokens: readonly TokenEntry[];
  readonly tokenDiagnostics: readonly TokenCatalogDiagnostic[];
  readonly tokenGeneration: string;
  readonly componentContracts: readonly ComponentContract[];
  /** Whether this runtime is the explicit public landing-page demo. */
  readonly demo?: boolean;
  /** Additional same-origin pages seeded into the public demo canvas. */
  readonly demoPages?: readonly string[];
  /** Labels for demo cards in display order, including the primary card. */
  readonly demoCardLabels?: readonly string[];
}

function cloneAndFreeze<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== "object") return value;

  const source = value as object;
  const existing = seen.get(source);
  if (existing) return existing as T;

  // An already-frozen subtree is immutable, so it can be reused by reference.
  // Repeated configuration with the same frozen payload (HMR re-runs, stub
  // spread patterns) keeps array identity stable for identity-keyed caches.
  if (Object.isFrozen(value)) {
    seen.set(source, value);
    return value;
  }

  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(source, copy);
    for (const item of value) copy.push(cloneAndFreeze(item, seen));
    return Object.freeze(copy) as T;
  }

  const copy: Record<string, unknown> = {};
  seen.set(source, copy);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    copy[key] = cloneAndFreeze(child, seen);
  }
  return Object.freeze(copy) as T;
}

const DEFAULT_RUNTIME_CONFIG = cloneAndFreeze<NudgeUiRuntimeConfig>({
  projectId: "/stub/project",
  host: "vite-react",
  framework: "React",
  stylingSystem: "CSS custom properties",
  capabilities: { canvas: true, componentSemantics: true, domNavigation: false },
  tokenCatalog: [],
  tokens: [],
  tokenDiagnostics: [],
  tokenGeneration: "",
  componentContracts: [],
});

const RUNTIME_HOSTS: readonly NudgeUiRuntimeHost[] = [
  "vite-react",
  "static-html",
  "nextjs-react",
  "astro",
];
const RUNTIME_FRAMEWORKS: readonly NudgeUiRuntimeFramework[] = [
  "React",
  "HTML",
  "Astro",
];
const normalizedRuntimeConfigs = new WeakSet<object>();

function isNormalizedRuntimeConfig(
  // Callers first narrow this value to a non-null object at the runtime boundary.
  // oxlint-disable-next-line anti-slop/no-object-parameters
  value: object,
): value is NudgeUiRuntimeConfig {
  return normalizedRuntimeConfigs.has(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value === "string" && value.length > 0) return value;
  throw new TypeError(
    `Nudge UI runtime configuration requires a non-empty string "${field}"; received ${
      value === undefined ? "undefined" : JSON.stringify(value)
    }.`,
  );
}

function requireEnum(
  input: Record<string, unknown>,
  field: string,
  allowed: readonly string[],
): string {
  const value = input[field];
  if (typeof value === "string" && allowed.includes(value)) return value;
  throw new TypeError(
    `Nudge UI runtime configuration requires "${field}" to be one of ${allowed.map(
      (candidate) => JSON.stringify(candidate),
    ).join(", ")}; received ${value === undefined ? "undefined" : JSON.stringify(value)}.`,
  );
}

function optionalString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (value === undefined) return "";
  if (typeof value !== "string") {
    throw new TypeError(`Nudge UI runtime configuration field "${field}" must be a string.`);
  }
  return value;
}

function optionalArray(input: Record<string, unknown>, field: string): readonly unknown[] {
  const value = input[field];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new TypeError(`Nudge UI runtime configuration field "${field}" must be an array.`);
  }
  return value;
}

function optionalBoolean(input: Record<string, unknown>, field: string): boolean {
  const value = input[field];
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new TypeError(
      `Nudge UI runtime capability "${field}" must be a boolean; received ${JSON.stringify(value)}.`,
    );
  }
  return value;
}

function optionalNonEmptyString(input: Record<string, unknown>, field: string): string | undefined {
  const value = input[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(
      `Nudge UI runtime configuration field "${field}" must be a non-empty string.`,
    );
  }
  return value;
}

function optionalStringArray(
  input: Record<string, unknown>,
  field: string,
): readonly string[] | undefined {
  const value = input[field];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(
      `Nudge UI runtime configuration field "${field}" must be an array of strings.`,
    );
  }
  return value as readonly string[];
}

function normalizeSourceCoordinatePolicy(
  input: Record<string, unknown>,
): SourceCoordinatePolicy | undefined {
  const policy = input.sourceCoordinates;
  if (policy === undefined) return undefined;
  if (!isPlainRecord(policy)) {
    throw new TypeError(
      'Nudge UI runtime capability "sourceCoordinates" must be an object.',
    );
  }
  return {
    exactCidPrefixes: optionalStringArray(policy, "exactCidPrefixes") ?? [],
    exactFileExtensions: optionalStringArray(policy, "exactFileExtensions") ?? [],
  };
}

function normalizeCapabilities(input: unknown): NudgeUiRuntimeCapabilities {
  if (input === undefined) return { canvas: false, componentSemantics: false, domNavigation: false };
  if (!isPlainRecord(input)) {
    throw new TypeError(
      'Nudge UI runtime configuration field "capabilities" must be an object.',
    );
  }
  return {
    canvas: optionalBoolean(input, "canvas"),
    componentSemantics: optionalBoolean(input, "componentSemantics"),
    domNavigation: optionalBoolean(input, "domNavigation"),
    sourceCoordinates: normalizeSourceCoordinatePolicy(input),
    scopingSelectorPattern: optionalNonEmptyString(input, "scopingSelectorPattern"),
  };
}

function optionalDemoFlag(input: Record<string, unknown>): true | undefined {
  const value = input.demo;
  if (value === undefined || value === false) return undefined;
  if (value !== true) {
    throw new TypeError(
      `Nudge UI runtime configuration field "demo" must be a boolean; received ${JSON.stringify(value)}.`,
    );
  }
  return true;
}

/**
 * Validates a host-supplied configuration and fills safe defaults.
 *
 * `projectId`, `host`, and `framework` are required identity fields; wrong
 * types or values fail fast at the host seam instead of leaking `undefined`
 * into storage keys or capability checks. Token arrays, the styling-system
 * label, generation string, and capabilities are optional and default to
 * empty/false values so a minimal host still bootstraps honestly.
 *
 * @param input The configuration supplied by a host Adapter.
 * @returns A complete plain-data configuration ready to snapshot.
 */
export function normalizeNudgeUiRuntimeConfig(input: unknown): NudgeUiRuntimeConfig {
  if (!isPlainRecord(input)) {
    throw new TypeError("Nudge UI runtime configuration must be an object.");
  }
  if (isNormalizedRuntimeConfig(input)) return input;
  const demo = optionalDemoFlag(input);
  const demoPages = optionalStringArray(input, "demoPages");
  const demoCardLabels = optionalStringArray(input, "demoCardLabels");
  const normalized = cloneAndFreeze<NudgeUiRuntimeConfig>({
    projectId: requireString(input, "projectId"),
    host: requireEnum(input, "host", RUNTIME_HOSTS) as NudgeUiRuntimeHost,
    framework: requireEnum(input, "framework", RUNTIME_FRAMEWORKS) as NudgeUiRuntimeFramework,
    stylingSystem: optionalString(input, "stylingSystem"),
    capabilities: normalizeCapabilities(input.capabilities),
    tokenCatalog: optionalArray(input, "tokenCatalog") as NudgeUiRuntimeConfig["tokenCatalog"],
    tokens: optionalArray(input, "tokens") as NudgeUiRuntimeConfig["tokens"],
    tokenDiagnostics: optionalArray(
      input,
      "tokenDiagnostics",
    ) as NudgeUiRuntimeConfig["tokenDiagnostics"],
    tokenGeneration: optionalString(input, "tokenGeneration"),
    componentContracts: optionalArray(
      input,
      "componentContracts",
    ) as NudgeUiRuntimeConfig["componentContracts"],
    ...(demo === true ? { demo: true } : {}),
    ...(demoPages === undefined ? {} : { demoPages }),
    ...(demoCardLabels === undefined ? {} : { demoCardLabels }),
  });
  normalizedRuntimeConfigs.add(normalized);
  return normalized;
}

let activeRuntimeConfig: NudgeUiRuntimeConfig = DEFAULT_RUNTIME_CONFIG;
const runtimeListeners = new Set<() => void>();

/**
 * Replaces the complete runtime configuration for the active document.
 *
 * The input is validated and incomplete optional fields receive safe defaults
 * (see `normalizeNudgeUiRuntimeConfig`). Replacement is atomic from the
 * inspector's perspective. The returned snapshot owns recursively cloned and
 * frozen plain data, so a host can safely replace its virtual module values
 * during HMR without leaving shared Modules bound to an old transport object
 * or freezing caller-owned values.
 */
export function configureNudgeUiRuntime(config: NudgeUiRuntimeConfig): void {
  activeRuntimeConfig = normalizeNudgeUiRuntimeConfig(config);
  for (const listener of runtimeListeners) {
    try {
      listener();
    } catch {
      // A runtime listener must not prevent the host from replacing config.
    }
  }
}

/** Returns the immutable runtime snapshot used by shared inspector Modules. */
export function getNudgeUiRuntimeConfig(): NudgeUiRuntimeConfig {
  return activeRuntimeConfig;
}

/**
 * Whether this document runs the explicit public landing demo (ADR-0014 and
 * ADR-0016). The plugin emits `demo: true` for the flagged demo route and for
 * the explicit landing root in development and `nudge-demo` builds, so this is
 * the precise runtime boundary of the demo — narrower than any build-mode
 * name.
 */
export function isDemoRuntime(): boolean {
  return getNudgeUiRuntimeConfig().demo === true;
}

/**
 * Returns the active host's source-coordinate policy, or null when the host
 * declares none — every source site is exact in that case.
 */
export function getSourceCoordinatePolicy(): SourceCoordinatePolicy | null {
  return activeRuntimeConfig.capabilities.sourceCoordinates ?? null;
}

let compiledScopingPattern: { source: string; pattern: RegExp | null } | null = null;

/**
 * Returns the active host's structural scoping-marker pattern compiled for
 * global replacement, or null when the host declares none. An invalid regex
 * source degrades to no stripping rather than breaking labeling.
 */
export function getScopingSelectorPattern(): RegExp | null {
  const source = activeRuntimeConfig.capabilities.scopingSelectorPattern;
  if (source === undefined) return null;
  if (compiledScopingPattern?.source !== source) {
    try {
      compiledScopingPattern = { source, pattern: new RegExp(source, "g") };
    } catch {
      compiledScopingPattern = { source, pattern: null };
    }
  }
  return compiledScopingPattern.pattern;
}

/**
 * Subscribes to complete runtime replacements, such as Vite HMR updates.
 * Listeners run after the new snapshot is installed.
 */
export function subscribeNudgeUiRuntime(listener: () => void): () => void {
  runtimeListeners.add(listener);
  return () => runtimeListeners.delete(listener);
}

/** Returns the styling-system label represented by a token inventory. */
export function detectStylingSystem(tokens: readonly TokenEntry[]): string {
  for (const token of tokens) {
    if (token.adapter === "vanilla-extract") return "vanilla-extract (sprinkles)";
    if (token.adapter === "tailwind-v3") return "Tailwind v3";
    if (token.adapter === "tailwind-v4") return "Tailwind v4";
  }
  return "CSS custom properties";
}

/** Returns a mutable container for UI controls that require array props. */
export function getNudgeUiTokenEntries(): TokenEntry[] {
  return [...activeRuntimeConfig.tokens];
}

export type { TokenCatalogDiagnostic, TokenDefinition, TokenEntry } from "../../css/model/index.ts";
export type { ComponentContract } from "../componentSemantics/types.ts";
