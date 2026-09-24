import { describe, expect, it } from "vitest";
import { automationManifestFields, isNudgeUiEnabled } from "./environment.ts";

describe("NUDGE_UI environment switch", () => {
  it.each(["0", "false", "OFF"])("disables the Adapter for NUDGE_UI=%s even when enabled is true", (value) => {
    expect(isNudgeUiEnabled(true, { NUDGE_UI: value })).toBe(false);
  });

  it("stays enabled by default and honors an explicit enabled: false", () => {
    expect(isNudgeUiEnabled(undefined, {})).toBe(true);
    expect(isNudgeUiEnabled(false, { NUDGE_UI: "1" })).toBe(false);
  });

  it("asks automated browsers to open the editor only for NUDGE_UI=1", () => {
    expect(automationManifestFields({ NUDGE_UI: "1" })).toEqual({ inspectAutomatedBrowsers: true });
    expect(automationManifestFields({})).toEqual({});
    expect(automationManifestFields({ NUDGE_UI: "0" })).toEqual({});
  });
});
