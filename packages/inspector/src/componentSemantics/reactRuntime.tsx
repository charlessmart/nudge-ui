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
  ComponentRuntimeAdapter,
  RuntimeComponentTarget,
} from "./types.ts";
import { getNudgeUiRuntimeConfig } from "../runtimeConfig.ts";

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
  if (!getNudgeUiRuntimeConfig().capabilities.componentSemantics) return [];
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
  if (!getNudgeUiRuntimeConfig().capabilities.componentSemantics) return;
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
