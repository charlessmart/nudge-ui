export interface SheetSetupInput {
  component: { readonly name: string; readonly file: string };
  /** Error messages thrown by cells; repeats are folded. */
  errors: readonly string[];
  failedCells: number;
  totalCells: number;
  /** Project-relative path of the sheet wrapper: the existing file, else where one would go. */
  wrapperFile: string;
  wrapperExists: boolean;
  /** Set when the wrapper file itself would not load. */
  wrapperError?: string | null;
}

const MAX_ERRORS = 5;
const MAX_ERROR_LENGTH = 300;

/** Distinct, trimmed messages in first-seen order. */
export function summarizeSheetErrors(errors: readonly string[]): string[] {
  const seen = new Set<string>();
  const summary: string[] = [];
  for (const raw of errors) {
    const message = raw.replace(/\s+/g, " ").trim().slice(0, MAX_ERROR_LENGTH);
    if (!message || seen.has(message)) continue;
    seen.add(message);
    summary.push(message);
    if (summary.length === MAX_ERRORS) break;
  }
  return summary;
}

/**
 * A prompt for a coding agent to set up the sheet wrapper. It carries what Nudge saw fail, because the agent can read
 * the application's entry for itself but cannot know which cells broke or why.
 */
export function buildSheetSetupPrompt(input: SheetSetupInput): string {
  const errors = summarizeSheetErrors(input.errors);
  const lines = [
    `Nudge's component sheet for \`${input.component.name}\` (${input.component.file}) could not render `
      + `${input.failedCells} of ${input.totalCells} cells.`,
    "A sheet mounts each component on its own, outside the application's root. Whatever the component reads from "
      + "context, a provider, a router or a store is missing there.",
    "",
    "Errors:",
    ...(errors.length > 0 ? errors.map((error) => `- ${error}`) : ["- (no message)"]),
    "",
  ];
  if (input.wrapperError) {
    lines.push(`\`${input.wrapperFile}\` exists but did not load: ${summarizeSheetErrors([input.wrapperError])[0]}`, "");
  }
  lines.push(
    input.wrapperExists
      ? `Update \`${input.wrapperFile}\` so the cells above render.`
      : `Create \`${input.wrapperFile}\` in the project root so the cells above render.`,
    "Nudge loads this file in development only and wraps every sheet cell in its default export. Nothing else imports it.",
    "",
    "Requirements:",
    "- Default-export a React component that renders `children` inside the providers the failing components need. "
      + "It also receives `component: { id, name }` if you want to vary by component.",
    "- Read the application's entry (for example src/main.tsx, src/App.tsx or app/layout.tsx) to find those providers "
      + "and reuse them. Prefer light stand-ins for anything with side effects: a MemoryRouter for a router, a fresh "
      + "QueryClient for react-query, an empty store for state.",
    "- Do not render the application's pages, start network requests, timers or analytics, or read secrets.",
    "- Do not change the components themselves to make the sheet work. If an error is about a prop the sheet cannot "
      + "generate (an object or callback) and not about missing context, leave it and say so.",
    "",
    "Shape:",
    "```tsx",
    'import type { ReactNode } from "react";',
    "",
    "export default function NudgeSheetWrapper({ children }: { children: ReactNode }) {",
    "  return <AppProviders>{children}</AppProviders>;",
    "}",
    "```",
    "",
    "The sheet reloads when the file is saved. Check that the cells render and that no \"Can't render\" cell remains "
      + "that this file could fix.",
  );
  return lines.join("\n");
}
