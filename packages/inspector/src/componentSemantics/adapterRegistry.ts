import type {
  ComponentOverride,
  ComponentRuntimeAdapter,
  EditableComponentTarget,
  RuntimeComponentTarget,
} from "./types.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import {
  copyComponentOverrides,
  copyRuntimeTarget,
  getHostRuntimeAdapters,
} from "./runtimeBridge.ts";

const runtimeAdapters: ComponentRuntimeAdapter[] = [];

function enabledRuntimeAdapters(): ComponentRuntimeAdapter[] {
  if (!getNudgeUiRuntimeConfig().capabilities.componentSemantics) return [];
  const adapters = new Map(
    getHostRuntimeAdapters().map((adapter) => [adapter.framework, adapter]),
  );
  for (const adapter of runtimeAdapters) adapters.set(adapter.framework, adapter);
  return [...adapters.values()];
}

/** Register a framework adapter without coupling semantic resolution to React. */
export function registerComponentRuntimeAdapter(adapter: ComponentRuntimeAdapter): () => void {
  runtimeAdapters.push(adapter);
  return () => {
    const index = runtimeAdapters.indexOf(adapter);
    if (index >= 0) runtimeAdapters.splice(index, 1);
  };
}

export function inspectComponentTargets(element: HTMLElement): RuntimeComponentTarget[] {
  return enabledRuntimeAdapters().flatMap((adapter) => adapter.inspect(element).map((value) => {
    const target = copyRuntimeTarget(value);
    return {
      ...target,
      mountedCount: target.mountedCount
        ?? adapter.getCallsiteMultiplicity?.(target.meta.callsiteId)
        ?? undefined,
    };
  }));
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
  if (!getNudgeUiRuntimeConfig().capabilities.componentSemantics) return [];
  const { componentContracts } = getNudgeUiRuntimeConfig();
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
  for (const adapter of enabledRuntimeAdapters()) {
    adapter.replaceOverrides(copyComponentOverrides(overrides.filter((override) =>
      override.framework === adapter.framework)));
  }
}
