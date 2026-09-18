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

const diagnosedAdapters = new WeakSet<ComponentRuntimeAdapter>();

function enabledRuntimeAdapters(ownerGlobal: typeof globalThis): ComponentRuntimeAdapter[] {
  if (!getNudgeUiRuntimeConfig().capabilities.componentSemantics) return [];
  return [...getHostRuntimeAdapters(ownerGlobal)];
}

/** Register a framework adapter without coupling semantic resolution to React. */
export function registerComponentRuntimeAdapter(adapter: ComponentRuntimeAdapter): () => void {
  return registerHostRuntimeAdapter(adapter);
}

export function inspectComponentTargets(element: HTMLElement): RuntimeComponentTarget[] {
  const targets: RuntimeComponentTarget[] = [];
  const ownerGlobal = element.ownerDocument.defaultView ?? globalThis;
  for (const adapter of enabledRuntimeAdapters(ownerGlobal)) {
    let inspected: RuntimeComponentTarget[];
    try {
      inspected = adapter.inspect(element);
      if (!Array.isArray(inspected)) {
        throw new TypeError("A host runtime Adapter returned a non-array inspection result.");
      }
    } catch (error) {
      diagnoseAdapter(adapter, error instanceof Error ? error.message : String(error));
      continue;
    }
    for (const value of inspected) {
      try {
        const target = copyRuntimeTarget(value);
        targets.push({
          ...target,
          mountedCount: target.mountedCount
            ?? adapter.getCallsiteMultiplicity?.(target.meta.callsiteId)
            ?? undefined,
        });
      } catch (error) {
        diagnoseAdapter(adapter, error instanceof Error ? error.message : String(error));
      }
    }
  }
  return targets;
}

function diagnoseAdapter(adapter: ComponentRuntimeAdapter, detail: string): void {
  if (diagnosedAdapters.has(adapter)) return;
  diagnosedAdapters.add(adapter);
  console.warn(`[nudge-ui] Ignored invalid ${adapter.framework} Adapter inspection: ${detail}`);
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
