import { describe, expect, it } from "vitest";
import { resolveFrameUrl } from "./appRoute.ts";

const origin = "http://localhost:5173";

describe("resolveFrameUrl", () => {
  it("resolves same-origin paths and strips editor state", () => {
    expect(resolveFrameUrl("/pricing", origin)).toEqual({
      href: "http://localhost:5173/pricing",
      error: null,
    });
    expect(resolveFrameUrl("/pricing?plan=pro&nudge-ui=editor#details", origin)).toEqual({
      href: "http://localhost:5173/pricing?plan=pro",
      error: null,
    });
  });

  it("rejects cross-origin and reserved inspector routes", () => {
    expect(resolveFrameUrl("https://example.com/pricing", origin)).toMatchObject({
      href: null,
      error: "Only pages from this app can be added.",
    });
    expect(resolveFrameUrl("/__nudge_ui__/editor", origin)).toMatchObject({
      href: null,
      error: "Nudge pages cannot be opened in a frame.",
    });
  });

  it("rejects empty and malformed input", () => {
    expect(resolveFrameUrl("  ", origin)).toMatchObject({ href: null });
    expect(resolveFrameUrl("http://[", origin)).toMatchObject({ href: null });
  });
});
