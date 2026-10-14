import {
  cloneElement,
  createElement,
  forwardRef,
  useEffect,
  useMemo,
  useSyncExternalStore,
  version as reactVersion,
  type ForwardRefExoticComponent,
  type Ref,
  type RefAttributes,
  type ReactElement,
} from "react";
import type {
  ComponentInvocationMeta,
  ComponentOverride,
  ComponentRootInvocation,
  ComponentRuntimeAdapter,
  RuntimeComponentTarget,
} from "./types.ts";
import { registerHostRuntimeAdapter } from "./runtimeBridge.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { findFiber, hostOutputCount, isHostOutput, type Fiber } from "./reactFibers.ts";
import {
  canPreviewLive,
  invocationProps,
  replaceTaggedOverrides,
  resetTaggedCallsites,
  taggedCallsiteMultiplicity,
  taggedInvocationsAbove,
  taggedRootInvocations,
} from "./reactCallsiteRuntime.ts";

export { registerReactCallsites } from "./reactCallsiteRuntime.ts";

const BOUNDARY_MARKER = Symbol.for("nudge-ui.react-component-boundary");
const EMPTY_OVERRIDE: Readonly<Record<string, unknown>> = Object.freeze({});
const REACT_MAJOR_VERSION = Number.parseInt(reactVersion, 10);

type BoundaryType = ForwardRefExoticComponent<BoundaryProps & RefAttributes<unknown>> & {
  [BOUNDARY_MARKER]?: true;
  displayName?: string;
};

interface BoundaryProps {
  element: ReactElement<Record<string, unknown>>;
  meta: ComponentInvocationMeta;
}

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
  resetTaggedCallsites();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function overrideFor(callsiteId: string): Readonly<Record<string, unknown>> {
  return overridesByCallsite.get(callsiteId) ?? EMPTY_OVERRIDE;
}

function sameOverrideProjection(
  next: Map<string, Readonly<Record<string, unknown>>>,
): boolean {
  if (next.size !== overridesByCallsite.size) return false;
  for (const [callsiteId, nextProps] of next) {
    const currentProps = overridesByCallsite.get(callsiteId);
    if (!currentProps) return false;
    const nextKeys = Object.keys(nextProps);
    const currentKeys = Object.keys(currentProps);
    if (nextKeys.length !== currentKeys.length) return false;
    if (nextKeys.some((property) => !Object.hasOwn(currentProps, property)
      || !Object.is(currentProps[property], nextProps[property]))) {
      return false;
    }
  }
  return true;
}

type RefCallbackWithCleanup<T> = (instance: T | null) => void | (() => void);

function getReactElementRef(element: ReactElement): Ref<unknown> | null {
  // React 19 exposes ref as a regular prop and warns when element.ref is read.
  if (Number.isFinite(REACT_MAJOR_VERSION) && REACT_MAJOR_VERSION >= 19) {
    return (element.props as { ref?: Ref<unknown> }).ref ?? null;
  }
  return (element as ReactElement & { ref?: Ref<unknown> }).ref ?? null;
}

function mergeRefs<T>(...refs: Array<Ref<T> | null>): Ref<T> | null {
  if (refs.every((ref) => ref === null)) return null;

  let cleanup: (() => void) | null = null;
  return (instance: T | null): void => {
    cleanup?.();
    cleanup = null;
    if (instance === null) return;

    const cleanupCallbacks = refs.map((ref) => {
      if (typeof ref === "function") {
        const result = (ref as RefCallbackWithCleanup<T>)(instance);
        return typeof result === "function" ? result : null;
      }
      if (ref !== null) {
        (ref as { current: T | null }).current = instance;
      }
      return null;
    });

    cleanup = () => {
      refs.forEach((ref, index) => {
        if (typeof ref === "function") {
          const cleanupCallback = cleanupCallbacks[index];
          if (cleanupCallback) cleanupCallback();
          else (ref as RefCallbackWithCleanup<T>)(null);
        } else if (ref !== null) {
          (ref as { current: T | null }).current = null;
        }
      });
    };
  };
}

const ReactComponentOverride = forwardRef<unknown, BoundaryProps>(
  function ReactComponentOverride(
    { element, meta, ...injectedProps },
    forwardedRef,
  ): ReactElement {
    useEffect(() => registerMountedCallsite(meta.callsiteId), [meta.callsiteId]);
    const override = useSyncExternalStore(
      subscribe,
      () => overrideFor(meta.callsiteId),
      () => EMPTY_OVERRIDE,
    );
    const elementRef = getReactElementRef(element);
    const mergedRef = useMemo(
      () => mergeRefs(elementRef, forwardedRef),
      [elementRef, forwardedRef],
    );
    const hasInjectedProps = Object.keys(injectedProps).length > 0;
    const hasOverride = Object.keys(override).length > 0;
    if (!hasInjectedProps && !hasOverride && forwardedRef === null) return element;

    const props: Record<string, unknown> = {
      ...injectedProps,
      ...override,
    };
    if (forwardedRef !== null) props.ref = mergedRef;
    return cloneElement(element, props);
  },
) as BoundaryType;

ReactComponentOverride[BOUNDARY_MARKER] = true;
ReactComponentOverride.displayName = "NudgeUiComponentOverride";

function isBoundaryType(value: unknown): value is BoundaryType {
  if (value === null || (typeof value !== "function" && typeof value !== "object")) return false;
  return Reflect.get(value, BOUNDARY_MARKER) === true;
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

function boundaryProps(fiber: Fiber): Partial<BoundaryProps> {
  // SAFETY: only a boundary fiber's props are read as BoundaryProps, and
  // callers check `isBoundaryType` and each field before using them.
  return (fiber.memoizedProps ?? {}) as Partial<BoundaryProps>;
}

/**
 * Wrapped callsites answer through their boundary; every other instrumented
 * callsite answers through its fiber's identity tag. Both are merged nearest
 * first, so the panel sees one ordered ancestry either way.
 */
export function inspectReactComponentTargets(element: HTMLElement): RuntimeComponentTarget[] {
  if (!getNudgeUiRuntimeConfig().capabilities.componentSemantics) return [];
  const host = findFiber(element);
  if (!host) return [];
  const ranked: Array<{ depth: number; target: RuntimeComponentTarget }> = [];
  const wrapped = new Set<string>();
  let depth = 0;
  for (let fiber: Fiber | null = host; fiber; fiber = fiber.return ?? null, depth += 1) {
    const { meta, element: sourceElement } = boundaryProps(fiber);
    if (!isBoundaryType(fiber.type) || !meta || !sourceElement) continue;
    wrapped.add(meta.callsiteId);
    ranked.push({
      depth,
      target: {
        framework: "react",
        meta,
        props: {
          ...sourceElement.props,
          ...overrideFor(meta.callsiteId),
        },
        mountedCount: getReactCallsiteMultiplicity(meta.callsiteId) ?? undefined,
      },
    });
  }
  for (const invocation of taggedInvocationsAbove(host)) {
    if (wrapped.has(invocation.meta.callsiteId)) continue;
    ranked.push({
      depth: invocation.depth,
      target: {
        framework: "react",
        meta: invocation.meta,
        props: invocationProps(invocation.fiber),
        mountedCount: taggedCallsiteMultiplicity(invocation.meta.callsiteId, invocation.root) ?? undefined,
        livePreview: canPreviewLive(invocation.root),
      },
    });
  }
  return ranked.sort((left, right) => left.depth - right.depth).map(({ target }) => target);
}

export function inspectReactRootInvocations(element: HTMLElement): ComponentRootInvocation[] | null {
  if (!getNudgeUiRuntimeConfig().capabilities.componentSemantics) return null;
  const host = findFiber(element);
  if (!host) return null;
  const ranked: Array<ComponentRootInvocation & { depth: number }> = [];
  let depth = 0;
  for (let fiber = host.return ?? null; fiber && !isHostOutput(fiber); fiber = fiber.return ?? null) {
    depth += 1;
    const { meta } = boundaryProps(fiber);
    if (!isBoundaryType(fiber.type) || !meta) continue;
    if (hostOutputCount(fiber) !== 1) break;
    ranked.push({ callsiteId: meta.callsiteId, componentName: meta.componentName, depth });
  }
  const seen = new Set(ranked.map((invocation) => invocation.callsiteId));
  for (const invocation of taggedRootInvocations(host)) {
    if (!seen.has(invocation.callsiteId)) ranked.push(invocation);
  }
  return ranked
    .sort((left, right) => left.depth - right.depth)
    .map(({ callsiteId, componentName }) => ({ callsiteId, componentName }));
}

/** Boundary accounting first; a tagged callsite is counted from the mounted tree. */
function callsiteMultiplicity(callsiteId: string): number | null {
  return getReactCallsiteMultiplicity(callsiteId) ?? taggedCallsiteMultiplicity(callsiteId);
}

export function replaceReactComponentOverrides(overrides: ComponentOverride[]): void {
  if (!getNudgeUiRuntimeConfig().capabilities.componentSemantics) return;
  const next = new Map<string, Record<string, unknown>>();
  for (const override of overrides) {
    if (override.framework !== "react") continue;
    const props = next.get(override.callsiteId) ?? {};
    props[override.prop] = override.value;
    next.set(override.callsiteId, props);
  }
  replaceTaggedOverrides(next);
  if (sameOverrideProjection(next)) return;
  overridesByCallsite = next;
  listeners.forEach((listener) => listener());
}

export const reactComponentRuntimeAdapter: ComponentRuntimeAdapter = {
  framework: "react",
  inspect: inspectReactComponentTargets,
  replaceOverrides: replaceReactComponentOverrides,
  getCallsiteMultiplicity: callsiteMultiplicity,
  rootInvocations: inspectReactRootInvocations,
};

registerHostRuntimeAdapter(reactComponentRuntimeAdapter);
