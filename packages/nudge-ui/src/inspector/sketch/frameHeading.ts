import { getCanvasCards, type CanvasCard } from "../canvas/canvasStore.ts";
import { contentSourceUrl } from "../canvas/frameContent.ts";
import { artifactIdFromUrl, htmlTarget } from "../drafts/model.ts";

/** The page path shown in sketch headings; origin, query, and hash stay out. */
function routePath(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

/**
 * Names the frame an annotated sketch targets, so the PNG stays actionable when
 * a user copies it to an agent without the handoff prompt. Iterations also name
 * their artifact file: the folder ID is the only stable identity an agent can
 * use to find the right iteration, since canvas iteration numbers are live
 * labels that nothing persists.
 */
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
