// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import {
  DEFAULT_CUSTOM_INSTRUCTIONS,
  loadCustomInstructions,
  promptSettingsStorageKey,
  saveCustomInstructions,
} from "./promptSettings.ts";

const projectId = "prompt-settings-project";
let previousConfig = getNudgeUiRuntimeConfig();

beforeEach(() => {
  previousConfig = getNudgeUiRuntimeConfig();
  localStorage.removeItem(promptSettingsStorageKey(projectId));
  configureNudgeUiRuntime({ ...previousConfig, projectId, host: "vite-react", framework: "React" });
});

afterEach(() => {
  localStorage.removeItem(promptSettingsStorageKey(projectId));
  configureNudgeUiRuntime(previousConfig);
});

describe("custom prompt instructions", () => {
  it("persists and restores instructions in normal runtimes", () => {
    expect(loadCustomInstructions(projectId)).toBe(DEFAULT_CUSTOM_INSTRUCTIONS);

    saveCustomInstructions(projectId, "Use warm colors.");
    expect(loadCustomInstructions(projectId)).toBe("Use warm colors.");
    expect(localStorage.getItem(promptSettingsStorageKey(projectId))).toBe("Use warm colors.");
  });

  it("never persists in demo runtimes and always serves the default", () => {
    configureNudgeUiRuntime({ ...getNudgeUiRuntimeConfig(), demo: true });

    saveCustomInstructions(projectId, "Demo instructions");
    expect(localStorage.getItem(promptSettingsStorageKey(projectId))).toBeNull();
    expect(loadCustomInstructions(projectId)).toBe(DEFAULT_CUSTOM_INSTRUCTIONS);
  });
});