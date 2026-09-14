import type {
  ComponentFramework,
  ComponentOverride,
  ComponentRuntimeAdapter,
  RuntimeComponentTarget,
} from "./types.ts";
import { isComponentFramework } from "./types.ts";

export type {
  ComponentFramework,
  ComponentInvocationMeta,
  ComponentOverride,
  ComponentRuntimeAdapter,
  RuntimeComponentTarget,
} from "./types.ts";

/** Version of the page-global host runtime Adapter Interface. */
export const NUDGE_UI_HOST_RUNTIME_VERSION = 1;

const HOST_RUNTIME_KEY = Symbol.for("nudge-ui.host-runtime.v1");

interface HostRuntimeRegistry {
  readonly version: typeof NUDGE_UI_HOST_RUNTIME_VERSION;
  readonly adapters: Map<ComponentFramework, ComponentRuntimeAdapter>;
  readonly overrides: Map<ComponentFramework, ComponentOverride[]>;
}

interface HostRuntimeRegistryCandidate {
  readonly version?: unknown;
  readonly adapters?: unknown;
  readonly overrides?: unknown;
}

type GlobalWithHostRuntime = typeof globalThis & {
  [HOST_RUNTIME_KEY]?: unknown;
};

function registry(): HostRuntimeRegistry {
  // SAFETY: this module exclusively owns the versioned symbol property and
  // validates its initialization before returning the registry.
  const target = globalThis as GlobalWithHostRuntime;
  const current = target[HOST_RUNTIME_KEY];
  if (current !== undefined) {
    if (!isHostRuntimeRegistry(current)) {
      throw new Error(
        `Nudge UI host runtime is incompatible with version ${NUDGE_UI_HOST_RUNTIME_VERSION}.`,
      );
    }
    return current;
  }
  const created: HostRuntimeRegistry = {
    version: NUDGE_UI_HOST_RUNTIME_VERSION,
    adapters: new Map(),
    overrides: new Map(),
  };
  target[HOST_RUNTIME_KEY] = created;
  return created;
}

/**
 * Registers a framework runtime Adapter in the host application's module graph.
 *
 * The registry lives on the page global because the self-contained inspector
 * client and the host Adapter intentionally have separate dependency graphs.
 * Registration replaces an older Adapter for the same framework so HMR does
 * not accumulate stale implementations.
 */
export function registerHostRuntimeAdapter(
  adapter: ComponentRuntimeAdapter,
): () => void {
  assertRuntimeAdapter(adapter);
  const hostRegistry = registry();
  hostRegistry.adapters.set(adapter.framework, adapter);
  const overrides = hostRegistry.overrides.get(adapter.framework);
  if (overrides) adapter.replaceOverrides(copyComponentOverrides(overrides));
  return () => {
    if (hostRegistry.adapters.get(adapter.framework) === adapter) {
      hostRegistry.adapters.delete(adapter.framework);
    }
  };
}

/** Returns the active host runtime Adapters for this browser realm. */
export function getHostRuntimeAdapters(): readonly ComponentRuntimeAdapter[] {
  return [...registry().adapters.values()];
}

/** Stores the latest projection and sends it to every registered host Adapter. */
export function replaceHostRuntimeAdapterOverrides(
  overrides: readonly ComponentOverride[],
): void {
  const hostRegistry = registry();
  const frameworks = new Set<ComponentFramework>([
    ...hostRegistry.adapters.keys(),
    ...hostRegistry.overrides.keys(),
  ]);
  for (const override of overrides) {
    assertComponentOverride(override);
    frameworks.add(override.framework);
  }
  for (const framework of frameworks) {
    const projection = copyComponentOverrides(
      overrides.filter((override) => override.framework === framework),
    );
    hostRegistry.overrides.set(framework, projection);
    hostRegistry.adapters.get(framework)?.replaceOverrides(
      copyComponentOverrides(projection),
    );
  }
}

/**
 * Copies a host Adapter result into the protocol's plain-data value space.
 * React elements, functions, and other reconciler-owned values never cross
 * the host/client seam.
 */
export function copyRuntimeTarget(
  target: RuntimeComponentTarget,
): RuntimeComponentTarget {
  assertRuntimeTarget(target);
  const props: Record<string, string | number | boolean> = {};
  for (const [name, value] of Object.entries(target.props)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      props[name] = value;
    }
  }
  return {
    framework: target.framework,
    meta: {
      callsiteId: target.meta.callsiteId,
      componentId: target.meta.componentId,
      componentName: target.meta.componentName,
      file: target.meta.file,
      line: target.meta.line,
      column: target.meta.column,
      authoredProps: { ...target.meta.authoredProps },
    },
    props,
    ...(target.mountedCount === undefined ? {} : { mountedCount: target.mountedCount }),
  };
}

/** Copies override commands before dispatching them into a host Adapter. */
export function copyComponentOverrides(
  overrides: readonly ComponentOverride[],
): ComponentOverride[] {
  return overrides.map((override) => {
    assertComponentOverride(override);
    return { ...override };
  });
}

function isHostRuntimeRegistry(
  // The page-global value comes from a separately bundled host Adapter.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is HostRuntimeRegistry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  // SAFETY: the object check above makes reading these optional candidate fields safe.
  const candidate = value as HostRuntimeRegistryCandidate;
  return candidate.version === NUDGE_UI_HOST_RUNTIME_VERSION
    && candidate.adapters instanceof Map
    && candidate.overrides instanceof Map;
}

function assertRuntimeAdapter(adapter: ComponentRuntimeAdapter): void {
  if (adapter === null
    || typeof adapter !== "object"
    || !isComponentFramework(adapter.framework)
    || typeof adapter.inspect !== "function"
    || typeof adapter.replaceOverrides !== "function") {
    throw new TypeError("Nudge UI received an invalid host runtime Adapter.");
  }
}

function assertRuntimeTarget(target: RuntimeComponentTarget): void {
  if (target === null
    || typeof target !== "object"
    || !isComponentFramework(target.framework)
    || target.meta === null
    || typeof target.meta !== "object"
    || target.props === null
    || typeof target.props !== "object"
    || Array.isArray(target.props)) {
    throw new TypeError("Nudge UI received an invalid component target from a host Adapter.");
  }
  const meta = target.meta;
  if (
    typeof meta.callsiteId !== "string"
    || meta.callsiteId.length === 0
    || typeof meta.componentId !== "string"
    || meta.componentId.length === 0
    || typeof meta.componentName !== "string"
    || meta.componentName.length === 0
    || typeof meta.file !== "string"
    || meta.file.length === 0
    || typeof meta.line !== "number"
    || typeof meta.column !== "number"
    || meta.authoredProps === null
    || typeof meta.authoredProps !== "object"
    || Array.isArray(meta.authoredProps)
  ) {
    throw new TypeError("Nudge UI received invalid component metadata from a host Adapter.");
  }
}

function assertComponentOverride(override: ComponentOverride): void {
  if (override === null
    || typeof override !== "object"
    || !isComponentFramework(override.framework)
    || typeof override.callsiteId !== "string"
    || override.callsiteId.length === 0
    || typeof override.prop !== "string"
    || override.prop.length === 0
    || !["string", "number", "boolean"].includes(typeof override.value)) {
    throw new TypeError("Nudge UI received an invalid component override.");
  }
}
