// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CUSTOM_INSTRUCTIONS,
  loadCustomInstructions,
  promptSettingsStorageKey,
  saveCustomInstructions,
} from "./promptSettings.ts";

afterEach(() => localStorage.clear());

describe("prompt settings", () => {
  it("uses the built-in guidance until a project has saved instructions", () => {
    expect(loadCustomInstructions("prompt-project")).toBe(DEFAULT_CUSTOM_INSTRUCTIONS);
  });

  it("persists instructions per project and preserves an explicit empty value", () => {
    saveCustomInstructions("prompt-project", "Use the project's component patterns.");
    saveCustomInstructions("other-project", "Prefer the existing utility classes.");

    expect(loadCustomInstructions("prompt-project")).toBe("Use the project's component patterns.");
    expect(loadCustomInstructions("other-project")).toBe("Prefer the existing utility classes.");

    saveCustomInstructions("prompt-project", "");
    expect(loadCustomInstructions("prompt-project")).toBe("");
    expect(localStorage.getItem(promptSettingsStorageKey("prompt-project"))).toBe("");
  });
});
