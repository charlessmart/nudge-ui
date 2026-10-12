export const PROMPT_TITLE = "# Requested design changes";

/** Keeps the title first when a host adds page or iteration instructions. */
export function withPromptContext(context: readonly string[], prompt: string): string {
  const body = prompt === PROMPT_TITLE || prompt.startsWith(`${PROMPT_TITLE}\n`)
    ? prompt.slice(PROMPT_TITLE.length).trimStart()
    : prompt;
  return [PROMPT_TITLE, "", ...context, ...(body.trim() ? ["", body] : [])].join("\n");
}
