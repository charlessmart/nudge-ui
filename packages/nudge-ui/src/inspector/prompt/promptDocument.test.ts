import { expect, it } from "vitest";
import { PROMPT_INTRO, withPromptContext } from "./promptDocument.ts";

it("keeps one opening line when a sketch-only prompt has no text changes", () => {
  expect(withPromptContext(["The page I'm working on is https://example.com/."], PROMPT_INTRO))
    .toBe(`${PROMPT_INTRO}\n\nThe page I'm working on is https://example.com/.`);
});

it("replaces the opening line of a generated prompt instead of repeating it", () => {
  const prompt = withPromptContext(["The page I'm working on is /."], `${PROMPT_INTRO}\n\nThe button:\n- Set color to red.`);
  expect(prompt).toBe(`${PROMPT_INTRO}\n\nThe page I'm working on is /.\n\nThe button:\n- Set color to red.`);
});
