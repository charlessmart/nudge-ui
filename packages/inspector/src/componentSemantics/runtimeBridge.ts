import type {
  ComponentFramework,
  ComponentOverride,
  ComponentRuntimeAdapter,
  RuntimeComponentTarget,
} from "./types.ts";

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
}

type GlobalWithHostRuntime = typeof globalThis & {
  [HOST_RUNTIME_KEY]?: HostRuntimeRegistry;
};

function registry(): HostRuntimeRegistry {
  // SAFETY: this module exclusively owns the versioned symbol property and
  // validates its initialization before returning the registry.
  const target = globalThis as GlobalWithHostRuntime;
  const current = target[HOST_RUNTIME_KEY];
  if (current) return current;
  const created: HostRuntimeRegistry = {
    version: NUDGE_UI_HOST_RUNTIME_VERSION,
    adapters: new Map(),
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
  const hostRegistry = registry();
  hostRegistry.adapters.set(adapter.framework, adapter);
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

/**
 * Copies a host Adapter result into the protocol's plain-data value space.
 * React elements, functions, and other reconciler-owned values never cross
 * the host/client seam.
 */
export function copyRuntimeTarget(
  target: RuntimeComponentTarget,
): RuntimeComponentTarget {
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
  return overrides.map((override) => ({ ...override }));
}
