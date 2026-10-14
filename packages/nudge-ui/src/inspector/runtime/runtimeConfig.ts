import type {
  TokenCatalogDiagnostic,
  TokenDefinition,
  TokenEntry,
} from "../../css/model/index.ts";
import type { ComponentContract } from "../componentSemantics/types.ts";

export type NudgeUiRuntimeHost =
  | "vite-react"
  | "static-html"
  | "nextjs-react"
  | "astro";

export type NudgeUiRuntimeFramework = "React" | "HTML" | "Astro";

export interface SourceCoordinatePolicy {
  /** Cid prefixes whose `data-src` line:column point at authored source. */
  readonly exactCidPrefixes: readonly string[];
  /** File extensions whose `data-src` line:column point at authored source. */
  readonly exactFileExtensions: readonly string[];
}

export interface NudgeUiRuntimeCapabilities {
  readonly canvas: boolean;
  readonly componentSemantics: boolean;
  readonly domNavigation?: boolean;
  /** Precision policy for prompt source coordinates; every source site is exact when omitted. */
  readonly sourceCoordinates?: SourceCoordinatePolicy;
  /** Regex for this host's scoping markers; stripped from selector labels, kept in change records. Omitted means no stripping. */
  readonly scopingSelectorPattern?: string;
}

export interface NudgeUiRuntimeFeatures {
  readonly sketch?: boolean;
  readonly canvasIterations?: boolean;
}

export interface NudgeUiRuntimeConfig {
  readonly projectId: string;
  readonly host: NudgeUiRuntimeHost;
  readonly framework: NudgeUiRuntimeFramework;
  readonly stylingSystem: string;
  readonly capabilities: NudgeUiRuntimeCapabilities;
  /** Omitted features remain enabled. */
  readonly features?: NudgeUiRuntimeFeatures;
  readonly tokenCatalog: readonly TokenDefinition[];
  readonly tokens: readonly TokenEntry[];
  readonly tokenDiagnostics: readonly TokenCatalogDiagnostic[];
  readonly tokenGeneration: string;
  readonly componentContracts: readonly ComponentContract[];
  /** Replaces the selection empty state when the page cannot be inspected. */
  readonly inspectionUnavailableReason?: string;
  readonly demo?: boolean;
  /** Additional same-origin pages seeded into the demo canvas. */
  readonly demoPages?: readonly string[];
  /** In display order, including the primary card. */
  readonly demoCardLabels?: readonly string[];
}

function cloneAndFreeze<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== "object") return value;

  const source = value as object;
  const existing = seen.get(source);
  if (existing) return existing as T;

  // Frozen subtrees are reused by reference so repeated configuration with the
  // same frozen payload keeps array identity for identity-keyed caches.
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

function optionalFeatureBoolean(input: Record<string, unknown>, field: string): boolean | undefined {
  const value = input[field];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new TypeError(
      `Nudge UI runtime feature "${field}" must be a boolean; received ${JSON.stringify(value)}.`,
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

function normalizeFeatures(input: unknown): NudgeUiRuntimeFeatures | undefined {
  if (input === undefined) return undefined;
  if (!isPlainRecord(input)) {
    throw new TypeError(
      'Nudge UI runtime configuration field "features" must be an object.',
    );
  }
  const sketch = optionalFeatureBoolean(input, "sketch");
  const canvasIterations = optionalFeatureBoolean(input, "canvasIterations");
  if (sketch === undefined && canvasIterations === undefined) return {};
  return {
    ...(sketch === undefined ? {} : { sketch }),
    ...(canvasIterations === undefined ? {} : { canvasIterations }),
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

/** Throws TypeError on invalid input; optional fields receive safe defaults. */
export function normalizeNudgeUiRuntimeConfig(input: unknown): NudgeUiRuntimeConfig {
  if (!isPlainRecord(input)) {
    throw new TypeError("Nudge UI runtime configuration must be an object.");
  }
  if (isNormalizedRuntimeConfig(input)) return input;
  const demo = optionalDemoFlag(input);
  const demoPages = optionalStringArray(input, "demoPages");
  const demoCardLabels = optionalStringArray(input, "demoCardLabels");
  const features = normalizeFeatures(input.features);
  const normalized = cloneAndFreeze<NudgeUiRuntimeConfig>({
    projectId: requireString(input, "projectId"),
    host: requireEnum(input, "host", RUNTIME_HOSTS) as NudgeUiRuntimeHost,
    framework: requireEnum(input, "framework", RUNTIME_FRAMEWORKS) as NudgeUiRuntimeFramework,
    stylingSystem: optionalString(input, "stylingSystem"),
    capabilities: normalizeCapabilities(input.capabilities),
    ...(features === undefined ? {} : { features }),
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
    ...(input.inspectionUnavailableReason === undefined ? {} : {
      inspectionUnavailableReason: optionalNonEmptyString(input, "inspectionUnavailableReason"),
    }),
    ...(demo === true ? { demo: true } : {}),
    ...(demoPages === undefined ? {} : { demoPages }),
    ...(demoCardLabels === undefined ? {} : { demoCardLabels }),
  });
  normalizedRuntimeConfigs.add(normalized);
  return normalized;
}

let activeRuntimeConfig: NudgeUiRuntimeConfig = DEFAULT_RUNTIME_CONFIG;
const runtimeListeners = new Set<() => void>();

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

export function getNudgeUiRuntimeConfig(): NudgeUiRuntimeConfig {
  return activeRuntimeConfig;
}

export function isNudgeUiFeatureEnabled(
  features: NudgeUiRuntimeFeatures | undefined,
  feature: keyof NudgeUiRuntimeFeatures,
): boolean {
  return features?.[feature] !== false;
}

/** The demo boundary is this flag, never a build-mode name. */
export function isDemoRuntime(): boolean {
  return getNudgeUiRuntimeConfig().demo === true;
}

export function getSourceCoordinatePolicy(): SourceCoordinatePolicy | null {
  return activeRuntimeConfig.capabilities.sourceCoordinates ?? null;
}

let compiledScopingPattern: { source: string; pattern: RegExp | null } | null = null;

/** Null when the host declares none; an invalid pattern degrades to no stripping. */
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

/** Listeners run after the new snapshot is installed. */
export function subscribeNudgeUiRuntime(listener: () => void): () => void {
  runtimeListeners.add(listener);
  return () => runtimeListeners.delete(listener);
}

export function detectStylingSystem(tokens: readonly TokenEntry[]): string {
  for (const token of tokens) {
    if (token.adapter === "vanilla-extract") return "vanilla-extract (sprinkles)";
    if (token.adapter === "tailwind-v3") return "Tailwind v3";
    if (token.adapter === "tailwind-v4") return "Tailwind v4";
  }
  return "CSS custom properties";
}

export function getNudgeUiTokenEntries(): TokenEntry[] {
  return [...activeRuntimeConfig.tokens];
}

export type { TokenCatalogDiagnostic, TokenDefinition, TokenEntry } from "../../css/model/index.ts";
export type { ComponentContract } from "../componentSemantics/types.ts";
