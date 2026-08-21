import type {
  TokenCatalogDiagnostic,
  TokenDefinition,
  TokenEntry,
} from "@design-tool/css/model";
import type { ComponentContract } from "./componentSemantics/types.ts";

/** The host Adapter that supplied the active inspector runtime. */
export type DesignToolRuntimeHost = "vite-react" | "static-html";

/** The framework semantics enabled for the active inspector runtime. */
export type DesignToolRuntimeFramework = "React" | "HTML";

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

let activeRuntimeConfig: DesignToolRuntimeConfig = DEFAULT_RUNTIME_CONFIG;
const runtimeListeners = new Set<() => void>();

function snapshotConfig(config: DesignToolRuntimeConfig): DesignToolRuntimeConfig {
  return cloneAndFreeze(config);
}

/**
 * Replaces the complete runtime configuration for the active document.
 *
 * Replacement is atomic from the inspector's perspective. The returned
 * snapshot owns recursively cloned and frozen plain data, so a host can safely
 * replace its virtual module values during HMR without leaving shared Modules
 * bound to an old transport object or freezing caller-owned values.
 */
export function configureDesignToolRuntime(config: DesignToolRuntimeConfig): void {
  activeRuntimeConfig = snapshotConfig(config);
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
