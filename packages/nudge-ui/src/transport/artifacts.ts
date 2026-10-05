/** Revisions cover both the agent-editable file and the browser editing base. */
export interface HtmlArtifactRevision {
  readonly document: string;
  readonly preview: string;
}

export const HTML_ARTIFACT_REVISION_ATTRIBUTE = "data-nudge-artifact-revision";
export const HTML_ITERATION_CONFLICT = "This iteration changed outside Nudge. Your visual edits are still pending. Create another iteration to keep your design, then clear this iteration’s changes to load the external update.";

export function isHtmlArtifactRevision(value: unknown): value is HtmlArtifactRevision {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.document === "string" && /^[a-f0-9]{64}$/.test(item.document)
    && typeof item.preview === "string" && /^[a-f0-9]{64}$/.test(item.preview);
}
