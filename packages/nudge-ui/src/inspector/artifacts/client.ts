import { NUDGE_UI_ARTIFACTS_PATH } from "../../transport/routes.ts";
import { captureHtmlStudy } from "./capture.ts";

export function artifactDocumentUrl(id: string): string {
  return `${NUDGE_UI_ARTIFACTS_PATH}/${id}/preview`;
}

export async function commitHtmlArtifact(id: string): Promise<void> {
  const response = await fetch(`${NUDGE_UI_ARTIFACTS_PATH}/${id}/commit`, { method: "POST" });
  if (!response.ok) throw new Error((await response.text()) || "The HTML study could not be committed.");
}

/** Promotes external edits to the frame's base without rewriting the agent's document. */
export async function refreshHtmlArtifact(id: string): Promise<boolean> {
  const response = await fetch(`${NUDGE_UI_ARTIFACTS_PATH}/${id}/revision`, { cache: "no-store" });
  if (!response.ok) return false;
  const revision = await response.json() as { document: string; preview: string };
  if (revision.document === revision.preview) return false;
  await commitHtmlArtifact(id);
  return true;
}

export async function createHtmlArtifact(frame: HTMLIFrameElement, sourceUrl: string, title: string): Promise<string> {
  const id = crypto.randomUUID();
  const html = await captureHtmlStudy(frame);
  const response = await fetch(NUDGE_UI_ARTIFACTS_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id, html, sourceUrl, title,
      viewport: { width: frame.clientWidth, height: frame.clientHeight },
    }),
  });
  if (!response.ok) throw new Error((await response.text()) || "The HTML study could not be saved.");
  return id;
}

export async function saveHtmlArtifact(id: string, frame: HTMLIFrameElement): Promise<void> {
  const html = await captureHtmlStudy(frame);
  const response = await fetch(`${NUDGE_UI_ARTIFACTS_PATH}/${id}/document`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ html }),
  });
  if (!response.ok) throw new Error((await response.text()) || "The HTML study could not be saved.");
}

export async function removeHtmlArtifact(id: string): Promise<void> {
  const response = await fetch(`${NUDGE_UI_ARTIFACTS_PATH}/${id}`, { method: "DELETE", keepalive: true });
  if (!response.ok) throw new Error((await response.text()) || "The HTML study could not be removed.");
}
