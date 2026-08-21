import { describe, expect, it } from "vitest";
import { isStandaloneClientManifest } from "./clientManifest.ts";
import { createStandaloneRuntimeManifest } from "./manifest.ts";

describe("isStandaloneClientManifest", () => {
  it("accepts the complete same-origin static HTML manifest", () => {
    expect(isStandaloneClientManifest(
      createStandaloneRuntimeManifest("static-html:fixture"),
    )).toBe(true);
  });

  it("rejects empty project identity and external runtime endpoints", () => {
    const manifest = createStandaloneRuntimeManifest("static-html:fixture");
    expect(isStandaloneClientManifest({
      ...manifest,
      runtime: { ...manifest.runtime, projectId: "" },
    })).toBe(false);
    expect(isStandaloneClientManifest({
      ...manifest,
      endpoints: { ...manifest.endpoints, reload: "https://example.com/events" },
    })).toBe(false);
  });
});
