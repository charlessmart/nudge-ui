import { componentContracts } from "virtual:design-tool-components";
import { reactComponentRuntimeAdapter } from "./reactRuntime.tsx";
import type {
  ComponentOverride,
  ComponentRuntimeAdapter,
  EditableComponentTarget,
  RuntimeComponentTarget,
} from "./types.ts";

const runtimeAdapters: ComponentRuntimeAdapter[] = [
  reactComponentRuntimeAdapter,
];

export function inspectComponentTargets(element: HTMLElement): RuntimeComponentTarget[] {
  return runtimeAdapters.flatMap((adapter) => adapter.inspect(element));
}

export function editableComponentTargets(
  targets: RuntimeComponentTarget[],
): EditableComponentTarget[] {
  return targets.flatMap((target) => {
    const exact = componentContracts.filter((contract) =>
      contract.componentId === target.meta.componentId);
    const matches = exact.length > 0
      ? exact
      : componentContracts.filter((contract) =>
          contract.name === target.meta.componentName);
    // A display name is safe only while it identifies one contract. A later
    // module resolver can provide exact package-qualified identity without
    // weakening this ambiguity guard.
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

export type {
  AuthoredPropKind,
  ComponentChangeRecord,
  ComponentChangeTarget,
  ComponentContract,
  ComponentFramework,
  ComponentInvocationMeta,
  ComponentOverride,
  ComponentPropBaseline,
  ComponentPropContract,
  ComponentPropValue,
  EditableComponentTarget,
  RuntimeComponentTarget,
} from "./types.ts";
