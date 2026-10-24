/** Revisions cover both the agent-editable file and the browser editing base. */
export interface HtmlArtifactRevision {
  readonly document: string;
  readonly preview: string;
}

/** Provenance stored beside one HTML iteration; the listing endpoint returns these. */
export interface HtmlArtifactMetadata {
  readonly id: string;
  readonly sourceUrl: string;
  readonly title: string;
  readonly capturedAt: number;
  readonly viewport: { readonly width: number; readonly height: number };
}

export const HTML_ARTIFACT_REVISION_ATTRIBUTE = "data-nudge-artifact-revision";
export const HTML_ITERATION_CONFLICT = "This iteration changed outside Nudge. Your visual edits are still pending. Create another iteration to keep your design, then clear this iteration’s changes to load the external update.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isHtmlArtifactMetadata(value: unknown): value is HtmlArtifactMetadata {
  if (!isRecord(value) || !isRecord(value.viewport)) return false;
  const { viewport } = value;
  return typeof value.id === "string" && /^[a-f0-9-]{36}$/i.test(value.id)
    && typeof value.sourceUrl === "string" && value.sourceUrl.length < 4096
    && typeof value.title === "string" && value.title.length < 512
    && typeof value.capturedAt === "number" && Number.isFinite(value.capturedAt) && value.capturedAt > 0
    && typeof viewport.width === "number" && viewport.width > 0
    && typeof viewport.height === "number" && viewport.height > 0;
}

export function isHtmlArtifactRevision(value: unknown): value is HtmlArtifactRevision {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.document === "string" && /^[a-f0-9]{64}$/.test(item.document)
    && typeof item.preview === "string" && /^[a-f0-9]{64}$/.test(item.preview);
}
