import {
  cloneElement,
  createElement,
  useEffect,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import type {
  ComponentInvocationMeta,
  ComponentOverride,
  ComponentRuntimeAdapter,
  RuntimeComponentTarget,
} from "./types.ts";
import { getDesignToolRuntimeConfig } from "../runtimeConfig.ts";

const BOUNDARY_MARKER = Symbol.for("design-tool.react-component-boundary");
const EMPTY_OVERRIDE: Readonly<Record<string, unknown>> = Object.freeze({});

type BoundaryType = ((props: BoundaryProps) => ReactElement) & {
  [BOUNDARY_MARKER]?: true;
  displayName?: string;
};

interface BoundaryProps {
  element: ReactElement<Record<string, unknown>>;
  meta: ComponentInvocationMeta;
}

type FiberLike = {
  type?: unknown;
  memoizedProps?: BoundaryProps;
  return?: FiberLike | null;
};

let overridesByCallsite = new Map<string, Readonly<Record<string, unknown>>>();
const listeners = new Set<() => void>();
/**
 * Mounted invocation accounting is runtime state, not canonical identity. A
 * boundary registers by its stable transformed callsite and unregisters on
 * unmount. This survives rerenders and React Strict Mode's effect probe, and
 * each Canvas iframe owns an independent registry/module instance.
 */
const mountedCallsites = new Map<string, number>();

function registerMountedCallsite(callsiteId: string): () => void {
  mountedCallsites.set(callsiteId, (mountedCallsites.get(callsiteId) ?? 0) + 1);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    const count = (mountedCallsites.get(callsiteId) ?? 1) - 1;
    if (count > 0) mountedCallsites.set(callsiteId, count);
    else mountedCallsites.delete(callsiteId);
  };
}

/** Returns null when this runtime has no mounted boundary for the callsite. */
export function getReactCallsiteMultiplicity(callsiteId: string): number | null {
  return mountedCallsites.get(callsiteId) ?? null;
}

/** Test/runtime teardown hook; canonical changes never depend on this state. */
export function resetReactComponentRuntime(): void {
  mountedCallsites.clear();
  overridesByCallsite = new Map();
  listeners.clear();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function overrideFor(callsiteId: string): Readonly<Record<string, unknown>> {
  return overridesByCallsite.get(callsiteId) ?? EMPTY_OVERRIDE;
}

const ReactComponentOverride = (({ element, meta }: BoundaryProps): ReactElement => {
  useEffect(() => registerMountedCallsite(meta.callsiteId), [meta.callsiteId]);
  const override = useSyncExternalStore(
    subscribe,
    () => overrideFor(meta.callsiteId),
    () => EMPTY_OVERRIDE,
  );
  return Object.keys(override).length > 0
    ? cloneElement(element, override)
    : element;
}) as BoundaryType;

ReactComponentOverride[BOUNDARY_MARKER] = true;
ReactComponentOverride.displayName = "DesignToolComponentOverride";

function isBoundaryType(value: unknown): value is BoundaryType {
  return typeof value === "function"
    && (value as BoundaryType)[BOUNDARY_MARKER] === true;
}

function findFiber(element: HTMLElement): FiberLike | null {
  for (const key of Object.keys(element)) {
    if (/^__reactFiber\$/.test(key) || /^__reactInternalInstance\$/.test(key)) {
      return (Reflect.get(element, key) as FiberLike | undefined) ?? null;
    }
  }
  return null;
}

export function instrumentReactComponent(
  element: ReactElement<Record<string, unknown>>,
  meta: ComponentInvocationMeta,
): ReactElement {
  return createElement(
    ReactComponentOverride,
    { key: element.key ?? undefined, element, meta },
  );
}

export function inspectReactComponentTargets(element: HTMLElement): RuntimeComponentTarget[] {
  if (!getDesignToolRuntimeConfig().capabilities.componentSemantics) return [];
  const targets: RuntimeComponentTarget[] = [];
  let fiber = findFiber(element);
  while (fiber) {
    if (isBoundaryType(fiber.type) && fiber.memoizedProps?.meta && fiber.memoizedProps.element) {
      const { meta, element: sourceElement } = fiber.memoizedProps;
      targets.push({
        framework: "react",
        meta,
        props: {
          ...sourceElement.props,
          ...overrideFor(meta.callsiteId),
        },
        mountedCount: getReactCallsiteMultiplicity(meta.callsiteId) ?? undefined,
      });
    }
    fiber = fiber.return ?? null;
  }
  return targets;
}

export function replaceReactComponentOverrides(overrides: ComponentOverride[]): void {
  if (!getDesignToolRuntimeConfig().capabilities.componentSemantics) return;
  const next = new Map<string, Record<string, unknown>>();
  for (const override of overrides) {
    if (override.framework !== "react") continue;
    const props = next.get(override.callsiteId) ?? {};
    props[override.prop] = override.value;
    next.set(override.callsiteId, props);
  }
  overridesByCallsite = next;
  listeners.forEach((listener) => listener());
}

export const reactComponentRuntimeAdapter: ComponentRuntimeAdapter = {
  framework: "react",
  inspect: inspectReactComponentTargets,
  replaceOverrides: replaceReactComponentOverrides,
  getCallsiteMultiplicity: getReactCallsiteMultiplicity,
};
