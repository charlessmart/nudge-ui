export const PROMPT_INTRO = "Please make these UI changes for me.";

/** Keeps the opening line first when a host adds page or iteration instructions. */
export function withPromptContext(context: readonly string[], prompt: string): string {
  const body = prompt === PROMPT_INTRO || prompt.startsWith(`${PROMPT_INTRO}\n`)
    ? prompt.slice(PROMPT_INTRO.length).trimStart()
    : prompt;
  return [PROMPT_INTRO, "", ...context, ...(body.trim() ? ["", body] : [])].join("\n");
}
