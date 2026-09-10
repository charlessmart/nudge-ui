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
  registerHostRuntimeAdapter,
  replaceHostRuntimeAdapterOverrides,
} from "./runtimeBridge.ts";

function enabledRuntimeAdapters(): ComponentRuntimeAdapter[] {
  if (!getNudgeUiRuntimeConfig().capabilities.componentSemantics) return [];
  return [...getHostRuntimeAdapters()];
}

/** Register a framework adapter without coupling semantic resolution to React. */
export function registerComponentRuntimeAdapter(adapter: ComponentRuntimeAdapter): () => void {
  return registerHostRuntimeAdapter(adapter);
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
  if (!getNudgeUiRuntimeConfig().capabilities.componentSemantics) return;
  replaceHostRuntimeAdapterOverrides(copyComponentOverrides(overrides));
}
