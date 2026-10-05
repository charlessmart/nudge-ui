/** Defines the edit destination for every HTML-iteration handoff, including fallback copies. */
export function htmlIterationPrompt(id: string, changes: string, noInspectorChanges: boolean, hasSketches: boolean, customInstructions = ""): string {
  const directory = `.nudge/artifacts/${id}`;
  return [
    "# Edit this HTML iteration",
    "",
    `Edit only \`${directory}/document.html\`. This is the standalone HTML and CSS shown in the selected Nudge iteration frame.`,
    "Preserve its responsive CSS and existing design edits. Keep application source files unchanged. Any original source locations below identify captured elements; they are not files to edit.",
    `Keep \`${directory}/baseline.html\`, \`${directory}/preview.html\`, and metadata unchanged. Nudge will reload the iteration from your updated document.`,
    ...(hasSketches ? ["Implement the attached sketch notes in this iteration's HTML and CSS. Match numbered notes to their marks in the image."] : []),
    "",
    ...(noInspectorChanges ? ["Use the current iteration as the editing base. Existing visual edits are already saved in its markup and styles.", ...(customInstructions.trim() ? ["", "## Custom instructions", "", customInstructions.trim()] : [])] : [changes]),
  ].join("\n");
}

export function htmlIterationImplementationPrompt(id: string, label: string, page: string, changes: string): string {
  const directory = `.nudge/artifacts/${id}`;
  return [
    `# Implement ${label} in the live app`,
    "",
    `Page: ${page}`,
    `Use \`${directory}/document.html\` as the design reference, including all saved visual edits.`,
    "Update application source for this page to match it. Reuse existing components and styles, and preserve app behavior and data.",
    "Keep iteration files unchanged; captured source locations below are hints for finding app code.",
    ...(changes.trim() ? ["", changes] : []),
  ].join("\n");
}
