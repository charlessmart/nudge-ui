export const EDIT_SCOPES = ["source-site", "rendered-instance"] as const;
export type EditScope = (typeof EDIT_SCOPES)[number];
