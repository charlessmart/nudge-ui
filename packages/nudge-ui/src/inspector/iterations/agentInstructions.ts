import { HTML_ARTIFACT_SHORT_ID_LENGTH, HTML_ARTIFACT_SLUG_MAX_LENGTH } from "../../transport/artifacts.ts";

/** Prompt text for an agent creating HTML prototypes that Nudge can index. */
export function artifactAgentInstructions(origin: string): string {
  return `Create standalone HTML prototypes for Nudge.

For each prototype:
1. Pick a short lowercase name, for example "landing-page-one". Use only lowercase letters a-z and digits 0-9, with single hyphens between words (no leading, trailing, or doubled hyphens), and keep it to ${HTML_ARTIFACT_SLUG_MAX_LENGTH} characters or fewer.
2. Generate a short random suffix, for example with crypto.randomUUID().replace(/-/g, "").slice(0, ${HTML_ARTIFACT_SHORT_ID_LENGTH}).
3. Create .nudge/artifacts/<name>-<suffix>/ in the project.
4. Write the same complete, self-contained HTML document to document.html and preview.html. Inline CSS, JavaScript, fonts, and images: Nudge serves only the HTML file from this directory, so separate asset files will not load.
5. Write metadata.json beside them:

{
  "id": "<name>-<suffix>",
  "sourceUrl": "${origin}/pricing",
  "title": "Descriptive prototype name",
  "capturedAt": 1760000000000,
  "viewport": { "width": 1440, "height": 900 }
}

Rules:
- id must exactly match the directory name.
- The directory name is the lowercase name, a final hyphen, and an ${HTML_ARTIFACT_SHORT_ID_LENGTH}-character lowercase hex suffix. The name part must be ${HTML_ARTIFACT_SLUG_MAX_LENGTH} characters or fewer.
- A 36-character UUID directory name still works for older prototypes.
- sourceUrl must be the same-origin application route this prototype is for. Replace /pricing with that route.
- capturedAt is the current Unix timestamp in milliseconds.
- viewport becomes the prototype frame size in Nudge.
- Use one directory per prototype. .nudge/ is local and gitignored.

When the files are written, open the Canvas navigator, click + next to Pages, and choose the prototype. Nudge scans .nudge/artifacts each time that menu opens.`;
}
