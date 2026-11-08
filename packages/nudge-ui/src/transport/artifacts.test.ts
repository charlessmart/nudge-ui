import { describe, expect, it } from "vitest";
import { HTML_ARTIFACT_SLUG_MAX_LENGTH, isHtmlArtifactId, isHtmlArtifactMetadata } from "./artifacts.ts";

describe("HTML artifact IDs", () => {
  it("accepts legacy UUID directories", () => {
    expect(isHtmlArtifactId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("accepts a readable slug and an eight-character suffix", () => {
    expect(isHtmlArtifactId("landing-page-one-4f3c2a1e")).toBe(true);
    expect(isHtmlArtifactId("frame-00000000")).toBe(true);
    expect(isHtmlArtifactId(`${"a".repeat(HTML_ARTIFACT_SLUG_MAX_LENGTH)}-4f3c2a1e`)).toBe(true);
  });

  it("rejects unsafe, uppercase, or malformed names", () => {
    for (const id of [
      "",
      "..",
      "landing page-4f3c2a1e",
      "Landing-4f3c2a1e",
      "landing--page-4f3c2a1e",
      "landing-4F3C2A1E",
      "landing-4f3c2a1",
      "landing-4f3c2a1e0",
      "-4f3c2a1e",
      "landing-4f3c2a1e/extra",
      `${"a".repeat(HTML_ARTIFACT_SLUG_MAX_LENGTH + 1)}-4f3c2a1e`,
    ]) {
      expect(isHtmlArtifactId(id), id).toBe(false);
    }
  });

  it("requires a valid ID in artifact metadata", () => {
    const metadata = {
      id: "landing-page-one-4f3c2a1e",
      sourceUrl: "http://localhost/page",
      title: "Landing page one",
      capturedAt: 1,
      viewport: { width: 800, height: 600 },
    };
    expect(isHtmlArtifactMetadata(metadata)).toBe(true);
    expect(isHtmlArtifactMetadata({ ...metadata, id: "not/an/id" })).toBe(false);
  });
});
