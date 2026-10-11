import { describe, expect, it } from "vitest";
import { htmlIterationImplementationPrompt, htmlIterationPrompt } from "./prompt.ts";

describe("HTML iteration handoff", () => {
  it("targets the artifact even when change evidence names original application source", () => {
    const prompt = htmlIterationPrompt("iteration-id", "Change color in src/Card.tsx", false, true);
    expect(prompt.startsWith("# Requested design changes\n")).toBe(true);
    expect(prompt).toContain("Edit only `.nudge/artifacts/iteration-id/document.html`");
    expect(prompt).toContain("Keep application source files unchanged");
    expect(prompt).toContain("Implement the attached sketch notes");
    expect(prompt).toContain("Change color");
  });

  it("exports a sketch-only iteration without an empty changes warning and keeps custom instructions", () => {
    const prompt = htmlIterationPrompt("iteration-id", "<!-- No changes to export -->", true, true, "Use accessible contrast.");
    expect(prompt.startsWith("# Requested design changes\n")).toBe(true);
    expect(prompt).not.toContain("No changes to export");
    expect(prompt).toContain("Use accessible contrast.");
    expect(prompt).toContain("Implement the attached sketch notes");
  });
});


it("puts the design header first and keeps it unique when implementing an iteration", () => {
  const prompt = htmlIterationImplementationPrompt("iteration-id", "V2", "https://example.com/", "# Requested design changes\n\n## Heading\n\n- **Change:** color: red");
  expect(prompt.startsWith("# Requested design changes\n")).toBe(true);
  expect(prompt.match(/^# Requested design changes$/gm)).toHaveLength(1);
  expect(prompt).toContain("Implement V2 in the live app");
  expect(prompt).toContain("Page: https://example.com/");
  expect(prompt).toContain("**Change:** color: red");
});
