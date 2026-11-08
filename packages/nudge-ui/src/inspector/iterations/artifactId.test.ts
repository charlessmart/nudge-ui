// @vitest-environment node
import { describe, expect, it } from "vitest";
import { artifactTitleSlug, createArtifactId, shortArtifactId } from "./artifactId.ts";

describe("artifact IDs", () => {
  it("turns a title into a short lowercase slug", () => {
    expect(artifactTitleSlug("Landing page one")).toBe("landing-page-one");
    expect(artifactTitleSlug("/playground")).toBe("playground");
    expect(artifactTitleSlug("Checkout · Step 2")).toBe("checkout-step-2");
    expect(artifactTitleSlug("Café & Bar")).toBe("cafe-bar");
  });

  it("falls back when a title has no usable characters", () => {
    expect(artifactTitleSlug("")).toBe("frame");
    expect(artifactTitleSlug("🎉")).toBe("frame");
    expect(artifactTitleSlug("---")).toBe("frame");
  });

  it("caps the slug at 48 characters without a trailing hyphen", () => {
    const slug = artifactTitleSlug("a".repeat(60));
    expect(slug).toHaveLength(48);
    expect(slug.endsWith("-")).toBe(false);

    const spaced = artifactTitleSlug(`${"a".repeat(47)} b`);
    expect(spaced).toHaveLength(47);
  });

  it("adds an eight-character lowercase hex suffix", () => {
    expect(createArtifactId("Landing page one", "4f3c2a1e")).toBe("landing-page-one-4f3c2a1e");
    expect(shortArtifactId()).toMatch(/^[a-f0-9]{8}$/);
  });
});
