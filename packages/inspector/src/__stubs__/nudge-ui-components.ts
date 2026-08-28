import type { ComponentContract } from "../componentSemantics/types.ts";
import {
  configureNudgeUiRuntime,
  getNudgeUiRuntimeConfig,
} from "../runtimeConfig.ts";

/**
 * Vitest uses this module in place of the host-generated virtual module.
 *
 * Tests intentionally mutate the exported fixture between cases. The real
 * host passes component contracts through `configureNudgeUiRuntime`, which
 * defensively clones and freezes them. Mirror that boundary after each test
 * fixture mutation so the fixture stays mutable while the runtime keeps its
 * production snapshot semantics.
 */
const mutableComponentContracts: ComponentContract[] = [];

function syncComponentContracts(): void {
  configureNudgeUiRuntime({
    ...getNudgeUiRuntimeConfig(),
    componentContracts: mutableComponentContracts,
  });
}

export const componentContracts: ComponentContract[] = new Proxy(mutableComponentContracts, {
  set(target, property, value): boolean {
    const changed = Reflect.set(target, property, value);
    if (changed) syncComponentContracts();
    return changed;
  },
  defineProperty(target, property, descriptor): boolean {
    const changed = Reflect.defineProperty(target, property, descriptor);
    if (changed) syncComponentContracts();
    return changed;
  },
  deleteProperty(target, property): boolean {
    const changed = Reflect.deleteProperty(target, property);
    if (changed) syncComponentContracts();
    return changed;
  },
});

syncComponentContracts();

export default componentContracts;
