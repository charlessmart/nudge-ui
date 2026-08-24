import { describe, expect, it } from "vitest";
import { isStandaloneClientManifest } from "./clientManifest.ts";
import { createStandaloneRuntimeManifest } from "./manifest.ts";

describe("isStandaloneClientManifest", () => {
  it("accepts the complete same-origin static HTML manifest", () => {
    const manifest = createStandaloneRuntimeManifest("static-html:fixture");
    expect(isStandaloneClientManifest(manifest)).toBe(true);
    expect(manifest.runtime.capabilities).toEqual({
      canvas: true,
      componentSemantics: false,
    });
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
    expect(isStandaloneClientManifest({
      ...manifest,
      runtime: {
        ...manifest.runtime,
        // The standalone host never publishes component semantics; a manifest
        // claiming them fails the client's validation contract.
        capabilities: { canvas: true, componentSemantics: true },
      },
    })).toBe(false);
  });
});
