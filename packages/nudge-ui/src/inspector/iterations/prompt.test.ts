import { describe, expect, it } from "vitest";
import { PROMPT_INTRO } from "../prompt/promptDocument.ts";
import { htmlIterationImplementationPrompt, htmlIterationPrompt } from "./prompt.ts";

describe("HTML iteration handoff", () => {
  it("targets the artifact even when change evidence names original application source", () => {
    const prompt = htmlIterationPrompt("iteration-id", "Change color in src/Card.tsx", false, true);
    expect(prompt.startsWith(`${PROMPT_INTRO}\n`)).toBe(true);
    expect(prompt).toContain("Please edit only .nudge/artifacts/iteration-id/document.html.");
    expect(prompt).toContain("leave the application source files alone");
    expect(prompt).toContain("Please implement them in this iteration's HTML and CSS");
    expect(prompt).toContain("Change color");
  });

  it("exports a sketch-only iteration without an empty changes warning and keeps custom instructions", () => {
    const prompt = htmlIterationPrompt("iteration-id", "<!-- No changes to export -->", true, true, "Use accessible contrast.");
    expect(prompt.startsWith(`${PROMPT_INTRO}\n`)).toBe(true);
    expect(prompt).not.toContain("No changes to export");
    expect(prompt.endsWith("\n\nUse accessible contrast.")).toBe(true);
    expect(prompt).toContain("Please implement them in this iteration's HTML and CSS");
  });
});


it("puts the opening line first and keeps it unique when implementing an iteration", () => {
  const prompt = htmlIterationImplementationPrompt("iteration-id", "V2", "https://example.com/", `${PROMPT_INTRO}\n\nThe heading:\n- Set color to red.`);
  expect(prompt.startsWith(`${PROMPT_INTRO}\n`)).toBe(true);
  expect(prompt.split(PROMPT_INTRO)).toHaveLength(2);
  expect(prompt).toContain("Please implement V2 in the live app. The page is https://example.com/.");
  expect(prompt).toContain("- Set color to red.");
});
