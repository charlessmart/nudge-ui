import { describe, expect, it } from "vitest";
import { htmlStudyPrompt } from "./prompt.ts";

describe("HTML study handoff", () => {
  it("targets the artifact even when change evidence names original application source", () => {
    const prompt = htmlStudyPrompt("study-id", "Change color in src/Card.tsx", false, true);
    expect(prompt).toContain("Edit only `.nudge/artifacts/study-id/document.html`");
    expect(prompt).toContain("Keep application source files unchanged");
    expect(prompt).toContain("Implement the attached sketch notes");
    expect(prompt).toContain("Change color");
  });

  it("exports a sketch-only study without an empty changes warning and keeps custom instructions", () => {
    const prompt = htmlStudyPrompt("study-id", "<!-- No changes to export -->", true, true, "Use accessible contrast.");
    expect(prompt).not.toContain("No changes to export");
    expect(prompt).toContain("Use accessible contrast.");
    expect(prompt).toContain("Implement the attached sketch notes");
  });
});
