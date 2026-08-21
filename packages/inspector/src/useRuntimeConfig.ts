import { useSyncExternalStore } from "react";
import type { DesignToolRuntimeConfig } from "./runtimeConfig.ts";
import {
  getDesignToolRuntimeConfig,
  subscribeDesignToolRuntime,
} from "./runtimeConfig.ts";

/**
 * Reads the immutable runtime snapshot reactively.
 *
 * Components that render runtime-derived UI (token catalogs, capability
 * gating) must use this hook instead of the plain getter, so a host that
 * atomically replaces the configuration during HMR or a dev-transport
 * refresh re-renders the subscribed tree with the new snapshot.
 */
export function useDesignToolRuntimeConfig(): DesignToolRuntimeConfig {
  return useSyncExternalStore(subscribeDesignToolRuntime, getDesignToolRuntimeConfig);
}
