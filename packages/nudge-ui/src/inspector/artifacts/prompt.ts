/** Defines the edit destination for every HTML-study handoff, including fallback copies. */
export function htmlStudyPrompt(id: string, changes: string, noInspectorChanges: boolean, hasSketches: boolean, customInstructions = ""): string {
  const directory = `.nudge/artifacts/${id}`;
  return [
    "# Edit this HTML study",
    "",
    `Edit only \`${directory}/document.html\`. This is the standalone HTML and CSS shown in the selected Nudge study frame.`,
    "Preserve its responsive CSS and existing design edits. Keep application source files unchanged. Any original source locations below identify captured elements; they are not files to edit.",
    `Keep \`${directory}/baseline.html\`, \`${directory}/preview.html\`, and metadata unchanged. Nudge will reload the study from your updated document.`,
    ...(hasSketches ? ["Implement the attached sketch notes in this artifact's HTML and CSS. Match numbered notes to their marks in the image."] : []),
    "",
    ...(noInspectorChanges ? ["Use the current artifact as the editing base. Existing visual edits are already saved in its markup and styles.", ...(customInstructions.trim() ? ["", "## Custom instructions", "", customInstructions.trim()] : [])] : [changes]),
  ].join("\n");
}
