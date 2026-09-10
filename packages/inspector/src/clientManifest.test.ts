import { describe, expect, it } from "vitest";
import {
  isNudgeUiClientManifest,
  parseNudgeUiClientManifest,
} from "./clientManifest.ts";

const validManifest = {
  version: 1,
  runtime: {
    projectId: "site",
    host: "astro",
    framework: "Astro",
    stylingSystem: "CSS custom properties",
    capabilities: { canvas: false, componentSemantics: true },
    tokenCatalog: [],
    tokens: [],
    tokenDiagnostics: [],
    tokenGeneration: "generation",
    componentContracts: [],
  },
};

describe("isNudgeUiClientManifest", () => {
  it("accepts a complete host-neutral runtime document", () => {
    expect(isNudgeUiClientManifest(validManifest)).toBe(true);
  });

  it("rejects unknown versions and invalid runtime identities", () => {
    expect(isNudgeUiClientManifest({ ...validManifest, version: 2 })).toBe(false);
    expect(isNudgeUiClientManifest({
      ...validManifest,
      runtime: { ...validManifest.runtime, host: "unknown" },
    })).toBe(false);
  });

  it("returns a normalized immutable runtime", () => {
    const manifest = parseNudgeUiClientManifest({
      version: 1,
      runtime: {
        projectId: "site",
        host: "astro",
        framework: "Astro",
      },
    });
    expect(manifest?.runtime).toMatchObject({
      stylingSystem: "",
      capabilities: { canvas: false, componentSemantics: false },
      tokens: [],
    });
    expect(Object.isFrozen(manifest?.runtime)).toBe(true);
  });
});
