// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { findClosestAnchor, isEligibleNavigation, hasDifferentRoute } from "./linkEligibility.ts";

function createAnchor(href: string, attrs: Record<string, string> = {}): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  for (const [key, value] of Object.entries(attrs)) {
    a.setAttribute(key, value);
  }
  document.body.appendChild(a);
  return a;
}

afterEach(() => {
  document.body.innerHTML = "";
});

function createEvent(overrides: Partial<MouseEvent> = {}): MouseEvent {
  return new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  });
}

function sameOriginUrl(path: string): string {
  return window.location.origin + path;
}

describe("findClosestAnchor", () => {
  it("returns the anchor when target is the anchor itself", () => {
    const a = createAnchor(sameOriginUrl("/about"));
    expect(findClosestAnchor(a)).toBe(a);
  });

  it("returns the closest anchor for a child element", () => {
    const a = createAnchor(sameOriginUrl("/about"));
    const span = document.createElement("span");
    a.appendChild(span);
    expect(findClosestAnchor(span)).toBe(a);
  });

  it("returns null for non-anchor targets", () => {
    const div = document.createElement("div");
    expect(findClosestAnchor(div)).toBeNull();
  });

  it("returns null for null target", () => {
    expect(findClosestAnchor(null)).toBeNull();
  });
});

describe("isEligibleNavigation", () => {
  it("allows same-origin unmodified link clicks", () => {
    const a = createAnchor(sameOriginUrl("/about"));
    expect(isEligibleNavigation(a, createEvent())).toBe(true);
  });

  it("rejects ctrl+click", () => {
    const a = createAnchor(sameOriginUrl("/about"));
    expect(isEligibleNavigation(a, createEvent({ ctrlKey: true }))).toBe(false);
  });

  it("rejects meta+click", () => {
    const a = createAnchor(sameOriginUrl("/about"));
    expect(isEligibleNavigation(a, createEvent({ metaKey: true }))).toBe(false);
  });

  it("rejects shift+click", () => {
    const a = createAnchor(sameOriginUrl("/about"));
    expect(isEligibleNavigation(a, createEvent({ shiftKey: true }))).toBe(false);
  });

  it("rejects anchor with download attribute", () => {
    const a = createAnchor(sameOriginUrl("/file.pdf"), { download: "" });
    expect(isEligibleNavigation(a, createEvent())).toBe(false);
  });

  it("rejects anchor with explicit target=_blank", () => {
    const a = createAnchor(sameOriginUrl("/about"), { target: "_blank" });
    expect(isEligibleNavigation(a, createEvent())).toBe(false);
  });

  it("rejects non-HTTP scheme (mailto)", () => {
    const a = createAnchor("mailto:test@example.com");
    expect(isEligibleNavigation(a, createEvent())).toBe(false);
  });

  it("rejects non-HTTP scheme (javascript)", () => {
    const a = createAnchor("javascript:void(0)");
    expect(isEligibleNavigation(a, createEvent())).toBe(false);
  });

  it("allows anchor with target=_self", () => {
    const a = createAnchor(sameOriginUrl("/about"), { target: "_self" });
    expect(isEligibleNavigation(a, createEvent())).toBe(true);
  });

  it("allows anchor with empty target", () => {
    const a = createAnchor(sameOriginUrl("/about"), { target: "" });
    expect(isEligibleNavigation(a, createEvent())).toBe(true);
  });

  it("allows HTTPS links", () => {
    const a = document.createElement("a");
    a.setAttribute("href", "https://localhost:5173/about");
    document.body.appendChild(a);
    expect(isEligibleNavigation(a, createEvent())).toBe(false);
  });

  it("rejects cross-origin links", () => {
    const a = createAnchor("https://example.com/about");
    expect(isEligibleNavigation(a, createEvent())).toBe(false);
  });
});

describe("hasDifferentRoute", () => {
  it("returns true when pathname differs", () => {
    const a = createAnchor(sameOriginUrl("/about"));
    expect(hasDifferentRoute(a)).toBe(true);
  });

  it("returns true when search differs", () => {
    const a = createAnchor(
      window.location.origin + window.location.pathname + "?tab=new",
    );
    expect(hasDifferentRoute(a)).toBe(true);
  });

  it("returns false for same pathname+search (hash only)", () => {
    const a = createAnchor(
      window.location.origin + window.location.pathname + window.location.search + "#section",
    );
    expect(hasDifferentRoute(a)).toBe(false);
  });

  it("returns false for fragile/invalid href", () => {
    const a = document.createElement("a");
    a.setAttribute("href", "");
    document.body.appendChild(a);
    expect(hasDifferentRoute(a)).toBe(false);
  });
});
