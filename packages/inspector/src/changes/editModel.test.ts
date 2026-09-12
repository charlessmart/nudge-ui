import { describe, expect, it } from "vitest";
import {
  isRenderedInstanceOverride,
  isRenderedInstanceRef,
} from "./editModel.ts";

const validRef = {
  sourceSite: { cid: "Button", src: "src/Button.tsx:12:3" },
  locator: {
    kind: "evidence",
    occurrence: 1,
    props: null,
    text: "Save",
    ariaLabel: "Save changes",
  },
};

describe("rendered instance edit model guards", () => {
  it("accepts a serializable rendered-instance reference", () => {
    expect(isRenderedInstanceRef(validRef)).toBe(true);
    expect(isRenderedInstanceOverride({ id: "override-1", target: validRef })).toBe(true);
  });

  it("accepts references without an accessible name", () => {
    const ref = {
      ...validRef,
      locator: { ...validRef.locator, ariaLabel: undefined },
    };

    expect(isRenderedInstanceRef(ref)).toBe(true);
  });

  it("rejects invalid rendered-instance evidence", () => {
    expect(isRenderedInstanceRef(null)).toBe(false);
    expect(isRenderedInstanceRef({ ...validRef, sourceSite: { cid: 42, src: "src/Button.tsx:12:3" } })).toBe(false);
    expect(isRenderedInstanceRef({
      ...validRef,
      locator: { ...validRef.locator, occurrence: 1.5 },
    })).toBe(false);
    expect(isRenderedInstanceRef({
      ...validRef,
      locator: { ...validRef.locator, props: undefined },
    })).toBe(false);
    expect(isRenderedInstanceRef({
      ...validRef,
      locator: { ...validRef.locator, ariaLabel: 42 },
    })).toBe(false);
  });

  it("rejects an override without a string id or valid target", () => {
    expect(isRenderedInstanceOverride({ id: 1, target: validRef })).toBe(false);
    expect(isRenderedInstanceOverride({ id: "override-1" })).toBe(false);
    expect(isRenderedInstanceOverride({ id: "override-1", target: { ...validRef, locator: null } })).toBe(false);
  });
});
