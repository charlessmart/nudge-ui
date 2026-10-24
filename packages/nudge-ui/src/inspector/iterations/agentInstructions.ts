/** Prompt text for an agent creating HTML prototypes that Nudge can index. */
export function artifactAgentInstructions(origin: string): string {
  return `Create standalone HTML prototypes for Nudge.

For each prototype:
1. Generate a UUID, for example with crypto.randomUUID().
2. Create .nudge/artifacts/<uuid>/ in the project.
3. Write the same complete, self-contained HTML document to document.html, preview.html, and baseline.html. Inline CSS, JavaScript, fonts, and images: Nudge serves only the HTML file from this directory, so separate asset files will not load.
4. Write metadata.json beside them:

{
  "id": "<uuid>",
  "sourceUrl": "${origin}/pricing",
  "title": "Descriptive prototype name",
  "capturedAt": 1760000000000,
  "viewport": { "width": 1440, "height": 900 }
}

Rules:
- id must exactly match the directory name and be a 36-character UUID.
- sourceUrl must be the same-origin application route this prototype is for. Replace /pricing with that route.
- capturedAt is the current Unix timestamp in milliseconds.
- viewport becomes the prototype frame size in Nudge.
- Use one directory per prototype. .nudge/ is local and gitignored.

When the files are written, open Add page > HTML iterations in Nudge. Nudge scans .nudge/artifacts when the menu opens, so close and reopen it if it is already open.`;
}
