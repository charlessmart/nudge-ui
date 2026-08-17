import { componentContracts } from "virtual:design-tool-components";
import { reactComponentRuntimeAdapter } from "./reactRuntime.tsx";
import type {
  ComponentOverride,
  ComponentRuntimeAdapter,
  EditableComponentTarget,
  RuntimeComponentTarget,
} from "./types.ts";

const runtimeAdapters: ComponentRuntimeAdapter[] = [reactComponentRuntimeAdapter];

/** Register a framework adapter without coupling semantic resolution to React. */
export function registerComponentRuntimeAdapter(adapter: ComponentRuntimeAdapter): () => void {
  runtimeAdapters.push(adapter);
  return () => {
    const index = runtimeAdapters.indexOf(adapter);
    if (index >= 0) runtimeAdapters.splice(index, 1);
  };
}

export function inspectComponentTargets(element: HTMLElement): RuntimeComponentTarget[] {
  return runtimeAdapters.flatMap((adapter) => adapter.inspect(element).map((target) => ({
    ...target,
    mountedCount: target.mountedCount
      ?? adapter.getCallsiteMultiplicity?.(target.meta.callsiteId)
      ?? undefined,
  })));
}

/**
 * Resolve multiplicity through the owning runtime Adapter. The inspector does
 * not infer it from DOM order or retain a React fiber as durable identity.
 */
export function callsiteMultiplicity(target: RuntimeComponentTarget): number | null {
  return target.mountedCount === undefined ? null : target.mountedCount;
}

export function editableComponentTargets(
  targets: RuntimeComponentTarget[],
): EditableComponentTarget[] {
  return targets.flatMap((target) => {
    const exact = componentContracts.filter((contract) =>
      contract.componentId === target.meta.componentId);
    const matches = exact.length > 0
      ? exact
      : componentContracts.filter((contract) => contract.name === target.meta.componentName);
    if (matches.length !== 1) return [];
    return [{ ...target, contract: matches[0]! }];
  });
}

export function replaceComponentOverrideProjection(overrides: ComponentOverride[]): void {
  for (const adapter of runtimeAdapters) {
    adapter.replaceOverrides(overrides.filter((override) =>
      override.framework === adapter.framework));
  }
}
