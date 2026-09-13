export const EDIT_SCOPES = ["source-site", "rendered-instance"] as const;
export type EditScope = (typeof EDIT_SCOPES)[number];

/** Returns whether a host value names a supported edit scope. */
export function isEditScope(value: unknown): value is EditScope {
  return EDIT_SCOPES.some((scope) => scope === value);
}
