// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isHtmlArtifactId } from "../../transport/artifacts.ts";
import { artifactAgentInstructions } from "./agentInstructions.ts";

describe("artifact agent instructions", () => {
  const text = artifactAgentInstructions("http://localhost:5173");

  it("gives an example name that forms a valid directory with a generated suffix", () => {
    const name = /for example "([^"]+)"/.exec(text)?.[1];
    expect(name).toBeDefined();
    const suffix = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    expect(isHtmlArtifactId(`${name}-${suffix}`)).toBe(true);
  });

  it("states the name rules the server enforces", () => {
    // Uppercase or doubled hyphens are skipped silently when Nudge lists artifacts.
    expect(isHtmlArtifactId("Landing-Page-4f3c2a1e")).toBe(false);
    expect(isHtmlArtifactId("landing--page-4f3c2a1e")).toBe(false);
    expect(text).toContain("lowercase letters a-z");
    expect(text).toContain("no leading, trailing, or doubled hyphens");
  });
});
