import { useSyncExternalStore } from "react";
import type { NudgeUiRuntimeConfig } from "./runtimeConfig.ts";
import {
  getNudgeUiRuntimeConfig,
  subscribeNudgeUiRuntime,
} from "./runtimeConfig.ts";

/** Components rendering runtime-derived UI must subscribe here, not through the plain getter. */
export function useNudgeUiRuntimeConfig(): NudgeUiRuntimeConfig {
  return useSyncExternalStore(subscribeNudgeUiRuntime, getNudgeUiRuntimeConfig);
}
