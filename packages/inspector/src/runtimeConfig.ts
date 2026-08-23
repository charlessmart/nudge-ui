import type {
  TokenCatalogDiagnostic,
  TokenDefinition,
  TokenEntry,
} from "@design-tool/css/model";
import type { ComponentContract } from "./componentSemantics/types.ts";

/** The host Adapter that supplied the active inspector runtime. */
export type DesignToolRuntimeHost =
  | "vite-react"
  | "static-html"
  | "nextjs-react"
  | "astro";

/** The framework semantics enabled for the active inspector runtime. */
export type DesignToolRuntimeFramework = "React" | "HTML" | "Astro";

/** Capabilities exposed by the active host Adapter. */
export interface DesignToolRuntimeCapabilities {
  /** Whether the multi-page Canvas workspace is available. */
  readonly canvas: boolean;
  /** Whether framework component inspection and prop overrides are available. */
  readonly componentSemantics: boolean;
}

/**
 * Browser knowledge supplied by a host Adapter before the inspector mounts.
 *
 * A host replaces the complete configuration when its document is replaced or
 * its development transport is refreshed. Shared inspector Modules read the
 * current snapshot through `getDesignToolRuntimeConfig()` and never import a
 * host-specific transport directly.
 */
export interface DesignToolRuntimeConfig {
  readonly projectId: string;
  readonly host: DesignToolRuntimeHost;
  readonly framework: DesignToolRuntimeFramework;
  readonly stylingSystem: string;
  readonly capabilities: DesignToolRuntimeCapabilities;
  readonly tokenCatalog: readonly TokenDefinition[];
  readonly tokens: readonly TokenEntry[];
  readonly tokenDiagnostics: readonly TokenCatalogDiagnostic[];
  readonly tokenGeneration: string;
  readonly componentContracts: readonly ComponentContract[];
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

const DEFAULT_RUNTIME_CONFIG = cloneAndFreeze<DesignToolRuntimeConfig>({
  projectId: "/stub/project",
  host: "vite-react",
  framework: "React",
  stylingSystem: "CSS custom properties",
  capabilities: { canvas: true, componentSemantics: true },
  tokenCatalog: [],
  tokens: [],
  tokenDiagnostics: [],
  tokenGeneration: "",
  componentContracts: [],
});

const RUNTIME_HOSTS: readonly DesignToolRuntimeHost[] = [
  "vite-react",
  "static-html",
  "nextjs-react",
  "astro",
];
const RUNTIME_FRAMEWORKS: readonly DesignToolRuntimeFramework[] = [
  "React",
  "HTML",
  "Astro",
];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value === "string" && value.length > 0) return value;
  throw new TypeError(
    `Design Tool runtime configuration requires a non-empty string "${field}"; received ${
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
    `Design Tool runtime configuration requires "${field}" to be one of ${allowed.map(
      (candidate) => JSON.stringify(candidate),
    ).join(", ")}; received ${value === undefined ? "undefined" : JSON.stringify(value)}.`,
  );
}

function optionalString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (value === undefined) return "";
  if (typeof value !== "string") {
    throw new TypeError(`Design Tool runtime configuration field "${field}" must be a string.`);
  }
  return value;
}

function optionalArray(input: Record<string, unknown>, field: string): readonly unknown[] {
  const value = input[field];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new TypeError(`Design Tool runtime configuration field "${field}" must be an array.`);
  }
  return value;
}

function optionalBoolean(input: Record<string, unknown>, field: string): boolean {
  const value = input[field];
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new TypeError(
      `Design Tool runtime capability "${field}" must be a boolean; received ${JSON.stringify(value)}.`,
    );
  }
  return value;
}

function normalizeCapabilities(input: unknown): DesignToolRuntimeCapabilities {
  if (input === undefined) return { canvas: false, componentSemantics: false };
  if (!isPlainRecord(input)) {
    throw new TypeError(
      'Design Tool runtime configuration field "capabilities" must be an object.',
    );
  }
  return {
    canvas: optionalBoolean(input, "canvas"),
    componentSemantics: optionalBoolean(input, "componentSemantics"),
  };
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
export function normalizeDesignToolRuntimeConfig(input: unknown): DesignToolRuntimeConfig {
  if (!isPlainRecord(input)) {
    throw new TypeError("Design Tool runtime configuration must be an object.");
  }
  return {
    projectId: requireString(input, "projectId"),
    host: requireEnum(input, "host", RUNTIME_HOSTS) as DesignToolRuntimeHost,
    framework: requireEnum(input, "framework", RUNTIME_FRAMEWORKS) as DesignToolRuntimeFramework,
    stylingSystem: optionalString(input, "stylingSystem"),
    capabilities: normalizeCapabilities(input.capabilities),
    tokenCatalog: optionalArray(input, "tokenCatalog") as DesignToolRuntimeConfig["tokenCatalog"],
    tokens: optionalArray(input, "tokens") as DesignToolRuntimeConfig["tokens"],
    tokenDiagnostics: optionalArray(
      input,
      "tokenDiagnostics",
    ) as DesignToolRuntimeConfig["tokenDiagnostics"],
    tokenGeneration: optionalString(input, "tokenGeneration"),
    componentContracts: optionalArray(
      input,
      "componentContracts",
    ) as DesignToolRuntimeConfig["componentContracts"],
  };
}

let activeRuntimeConfig: DesignToolRuntimeConfig = DEFAULT_RUNTIME_CONFIG;
const runtimeListeners = new Set<() => void>();

/**
 * Replaces the complete runtime configuration for the active document.
 *
 * The input is validated and incomplete optional fields receive safe defaults
 * (see `normalizeDesignToolRuntimeConfig`). Replacement is atomic from the
 * inspector's perspective. The returned snapshot owns recursively cloned and
 * frozen plain data, so a host can safely replace its virtual module values
 * during HMR without leaving shared Modules bound to an old transport object
 * or freezing caller-owned values.
 */
export function configureDesignToolRuntime(config: DesignToolRuntimeConfig): void {
  activeRuntimeConfig = cloneAndFreeze(normalizeDesignToolRuntimeConfig(config));
  for (const listener of runtimeListeners) {
    try {
      listener();
    } catch {
      // A runtime listener must not prevent the host from replacing config.
    }
  }
}

/** Returns the immutable runtime snapshot used by shared inspector Modules. */
export function getDesignToolRuntimeConfig(): DesignToolRuntimeConfig {
  return activeRuntimeConfig;
}

/**
 * Subscribes to complete runtime replacements, such as Vite HMR updates.
 * Listeners run after the new snapshot is installed.
 */
export function subscribeDesignToolRuntime(listener: () => void): () => void {
  runtimeListeners.add(listener);
  return () => runtimeListeners.delete(listener);
}

/** Returns a mutable container for UI controls that require array props. */
export function getDesignToolTokenEntries(): TokenEntry[] {
  return [...activeRuntimeConfig.tokens];
}

export type { TokenCatalogDiagnostic, TokenDefinition, TokenEntry } from "@design-tool/css/model";
export type { ComponentContract } from "./componentSemantics/types.ts";
