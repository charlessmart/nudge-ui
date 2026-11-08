import { isNudgeUiFeatureEnabled, type NudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";

/** The Pages and Components views live in the inspector panel, including when the page is inspected in place. */
export function isNavigatorAvailable(config: NudgeUiRuntimeConfig): boolean {
  return config.capabilities.canvas && isNudgeUiFeatureEnabled(config.features, "navigator");
}
