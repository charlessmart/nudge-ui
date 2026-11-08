import {
  HTML_ARTIFACT_SHORT_ID_LENGTH,
  HTML_ARTIFACT_SLUG_MAX_LENGTH,
} from "../../transport/artifacts.ts";

const FALLBACK_SLUG = "frame";

/** Turns a display title into a short, filesystem-safe, URL-safe directory name. */
export function artifactTitleSlug(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, HTML_ARTIFACT_SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
  return slug || FALLBACK_SLUG;
}

/** Eight lowercase hex characters are enough for a local gallery of artifacts. */
export function shortArtifactId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, HTML_ARTIFACT_SHORT_ID_LENGTH);
}

/** Creates the folder name and artifact ID: a readable title slug plus a short random suffix. */
export function createArtifactId(title: string, suffix = shortArtifactId()): string {
  return `${artifactTitleSlug(title)}-${suffix}`;
}
