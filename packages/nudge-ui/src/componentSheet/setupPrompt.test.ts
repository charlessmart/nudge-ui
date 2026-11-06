import { describe, expect, it } from "vitest";
import { buildSheetSetupPrompt, summarizeSheetErrors } from "./setupPrompt.ts";

const base = {
  component: { name: "ThemeToggle", file: "src/ThemeToggle.tsx" },
  failedCells: 4,
  totalCells: 12,
  wrapperFile: "nudge.sheet.tsx",
  wrapperExists: false,
};

describe("summarizeSheetErrors", () => {
  it("folds repeats, trims whitespace and keeps the first few", () => {
    const errors = ["useTheme must be\n  used within ThemeProvider", "useTheme must be used within ThemeProvider", "", ...Array.from({ length: 8 }, (_, i) => `e${i}`)];
    const summary = summarizeSheetErrors(errors);
    expect(summary[0]).toBe("useTheme must be used within ThemeProvider");
    expect(summary).toHaveLength(5);
  });

  it("cuts very long messages", () => {
    expect(summarizeSheetErrors(["x".repeat(2000)])[0]).toHaveLength(300);
  });
});

describe("buildSheetSetupPrompt", () => {
  it("names the component, the failures and the file to create", () => {
    const prompt = buildSheetSetupPrompt({ ...base, errors: ["useTheme must be used within ThemeProvider"] });
    expect(prompt).toContain("`ThemeToggle` (src/ThemeToggle.tsx) could not render 4 of 12 cells");
    expect(prompt).toContain("- useTheme must be used within ThemeProvider");
    expect(prompt).toContain("Create `nudge.sheet.tsx` in the project root");
    expect(prompt).toContain("Do not change the components themselves");
  });

  it("asks for an update when the wrapper exists, and reports one that did not load", () => {
    const prompt = buildSheetSetupPrompt({ ...base, errors: [], wrapperExists: true, wrapperError: "Failed to resolve import ./theme" });
    expect(prompt).toContain("Update `nudge.sheet.tsx`");
    expect(prompt).toContain("exists but did not load: Failed to resolve import ./theme");
    expect(prompt).toContain("- (no message)");
  });
});
