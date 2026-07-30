import {
  cloneElement,
  createElement,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import type {
  ComponentInvocationMeta,
  ComponentOverride,
  ComponentRuntimeAdapter,
  RuntimeComponentTarget,
} from "./types.ts";

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

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function overrideFor(callsiteId: string): Readonly<Record<string, unknown>> {
  return overridesByCallsite.get(callsiteId) ?? EMPTY_OVERRIDE;
}

const ReactComponentOverride = (({ element, meta }: BoundaryProps): ReactElement => {
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
      return (element as unknown as Record<string, FiberLike>)[key] ?? null;
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
      });
    }
    fiber = fiber.return ?? null;
  }
  return targets;
}

export function replaceReactComponentOverrides(overrides: ComponentOverride[]): void {
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
};
