/** The default guidance included in every generated prompt. */
export const DEFAULT_CUSTOM_INSTRUCTIONS =
  "Preserve existing tokens, logical properties, and CSS intent while applying these rendered changes.";

function storageKey(projectId: string): string {
  return `nudge-ui:${projectId}:prompt-settings`;
}

/** Reads the project-scoped custom prompt instructions from browser storage. */
export function loadCustomInstructions(projectId: string): string {
  if (typeof localStorage === "undefined") return DEFAULT_CUSTOM_INSTRUCTIONS;
  try {
    return localStorage.getItem(storageKey(projectId)) ?? DEFAULT_CUSTOM_INSTRUCTIONS;
  } catch {
    return DEFAULT_CUSTOM_INSTRUCTIONS;
  }
}

/** Persists custom prompt instructions without making storage availability a prerequisite for editing. */
export function saveCustomInstructions(projectId: string, instructions: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(projectId), instructions);
  } catch {
    // Storage can be disabled or full; the in-memory UI state still applies.
  }
}

export { storageKey as promptSettingsStorageKey };
