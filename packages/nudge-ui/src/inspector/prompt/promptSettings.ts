import { inspectorStorage } from "../runtime/inspectorStorage.ts";
import { isDemoRuntime } from "../runtime/runtimeConfig.ts";

export const DEFAULT_CUSTOM_INSTRUCTIONS =
  "Preserve existing tokens, logical properties, and CSS intent while applying these rendered changes.";

function storageKey(projectId: string): string {
  return `nudge-ui:${projectId}:prompt-settings`;
}

export function loadCustomInstructions(projectId: string): string {
  if (isDemoRuntime()) return DEFAULT_CUSTOM_INSTRUCTIONS;
  try {
    return inspectorStorage()?.getItem(storageKey(projectId)) ?? DEFAULT_CUSTOM_INSTRUCTIONS;
  } catch {
    return DEFAULT_CUSTOM_INSTRUCTIONS;
  }
}

export function saveCustomInstructions(projectId: string, instructions: string): void {
  if (isDemoRuntime()) return; // demo runtimes never persist
  try {
    inspectorStorage()?.setItem(storageKey(projectId), instructions);
  } catch {
    // Storage can be disabled or full; the in-memory UI state still applies.
  }
}

export { storageKey as promptSettingsStorageKey };
