import { describe, expect, it } from "vitest";
import { validateCompatibilityManifest } from "./manifest.ts";

describe("compatibility manifest", () => {
  it("validates scenario identity and invariant references", () => {
    expect(validateCompatibilityManifest({
      name: "fixture",
      scenarios: [
        { id: "base", selector: "#card", properties: [{ property: "color" }] },
        { id: "rerender", selector: "#card", properties: [{ property: "color" }] },
      ],
      invariants: [{
        id: "stable-rerender",
        left: "base",
        right: "rerender",
        property: "color",
        equal: ["tokenName", "computed"],
      }],
    })).toEqual([]);
  });

  it("reports malformed manifests before a browser starts", () => {
    expect(validateCompatibilityManifest({
      name: "fixture",
      scenarios: [
        { id: "duplicate", selector: "", properties: [] },
        { id: "duplicate", selector: "#other", properties: [{ property: "color" }] },
      ],
      invariants: [{ id: "broken", left: "missing", right: "duplicate", property: "color", equal: [] }],
    })).toEqual([
      "duplicate: selector is empty",
      "duplicate: no property expectations",
      "duplicate scenario id: duplicate",
      "broken: unknown left scenario missing",
      "broken: invariant compares nothing",
    ]);
  });
});
