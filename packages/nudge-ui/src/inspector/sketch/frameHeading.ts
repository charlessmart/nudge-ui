import { getCanvasCards, type CanvasCard } from "../canvas/canvasStore.ts";
import { contentSourceUrl } from "../canvas/frameContent.ts";
import { artifactIdFromUrl, htmlTarget } from "../drafts/model.ts";

function routePath(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

/** Iterations also name their artifact folder: iteration numbers are live labels that nothing persists. */
export function sketchFrameHeading(
  captureUrl: string,
  frameCards: readonly CanvasCard[] = getCanvasCards(),
): string {
  const artifactId = artifactIdFromUrl(captureUrl);
  if (!artifactId) return `Implement these changes for "${routePath(captureUrl)}"`;
  const card = frameCards.find((candidate) => candidate.content.kind === "iteration"
    && candidate.content.artifactId === artifactId);
  const path = htmlTarget(artifactId).path;
  return card
    ? `Implement these changes for the HTML iteration "${routePath(contentSourceUrl(card.content))}" (${path})`
    : `Implement these changes for the HTML iteration (${path})`;
}
