import { withPromptContext } from "../prompt/promptDocument.ts";

export function htmlIterationPrompt(id: string, changes: string, noInspectorChanges: boolean, hasSketches: boolean, customInstructions = ""): string {
  const directory = `.nudge/artifacts/${id}`;
  return withPromptContext([
    `Please edit only ${directory}/document.html. It's the standalone HTML and CSS shown in the Nudge iteration I have selected.`,
    "Keep its responsive CSS and the design edits I've already made, and leave the application source files alone. Any original source locations below just identify the captured elements; they aren't files to edit.",
    `Please also leave ${directory}/baseline.html, ${directory}/preview.html, and the metadata as they are. Nudge will reload the iteration from your updated document.`,
    ...(hasSketches ? ["I've attached sketch notes. Please implement them in this iteration's HTML and CSS, matching each numbered note to its mark in the image."] : []),
  ], noInspectorChanges
    ? ["Use the current iteration as your starting point. The visual edits I've made are already saved in its markup and styles.", ...(customInstructions.trim() ? ["", customInstructions.trim()] : [])].join("\n")
    : changes);
}

export function htmlIterationImplementationPrompt(id: string, label: string, page: string, changes: string): string {
  const directory = `.nudge/artifacts/${id}`;
  return withPromptContext([
    `Please implement ${label} in the live app. The page is ${page}.`,
    `Use ${directory}/document.html as the design reference, including all my saved visual edits.`,
    "Update the application source for this page to match it. Reuse existing components and styles, and preserve the app's behavior and data.",
    "Please leave the iteration files alone; the captured source locations below are only hints for finding the app code.",
  ], changes);
}
