import { isHtmlArtifactRevision, HTML_ITERATION_CONFLICT, type HtmlArtifactRevision } from "../../transport/artifacts.ts";
import { NUDGE_UI_ARTIFACTS_PATH } from "../../transport/routes.ts";
import { captureHtmlIteration } from "./capture.ts";

export function artifactDocumentUrl(id: string): string {
  return `${NUDGE_UI_ARTIFACTS_PATH}/${id}/preview`;
}

export async function readHtmlArtifactRevision(id: string): Promise<HtmlArtifactRevision> {
  const response = await fetch(`${NUDGE_UI_ARTIFACTS_PATH}/${id}/revision`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("The HTML iteration could not be refreshed.");
  const revision: unknown = await response.json();
  if (!isHtmlArtifactRevision(revision)) throw new Error("The HTML iteration returned an invalid revision.");
  return revision;
}

/** Checks the editing base before saving and promoting a captured document. */
export async function commitHtmlArtifact(id: string, expected: HtmlArtifactRevision, html?: string): Promise<HtmlArtifactRevision> {
  const response = await fetch(`${NUDGE_UI_ARTIFACTS_PATH}/${id}/commit`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expected, ...(html === undefined ? {} : { html }) }),
  });
  if (response.status === 409) throw new Error(HTML_ITERATION_CONFLICT);
  if (!response.ok) throw new Error((await response.text()) || "The HTML iteration could not be saved.");
  const revision: unknown = await response.json();
  if (!isHtmlArtifactRevision(revision)) throw new Error("The HTML iteration returned an invalid revision.");
  return revision;
}

export async function createHtmlArtifact(frame: HTMLIFrameElement, sourceUrl: string, title: string, capturedHtml?: string): Promise<string> {
  const id = crypto.randomUUID();
  const html = capturedHtml ?? await captureHtmlIteration(frame);
  const response = await fetch(NUDGE_UI_ARTIFACTS_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id, html, sourceUrl, title,
      viewport: { width: frame.clientWidth, height: frame.clientHeight },
    }),
  });
  if (!response.ok) throw new Error((await response.text()) || "The HTML iteration could not be saved.");
  return id;
}

export async function removeHtmlArtifact(id: string): Promise<void> {
  const response = await fetch(`${NUDGE_UI_ARTIFACTS_PATH}/${id}`, { method: "DELETE", keepalive: true });
  if (!response.ok) throw new Error((await response.text()) || "The HTML iteration could not be removed.");
}
