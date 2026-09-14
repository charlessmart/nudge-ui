// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { normalizeUrl, normalizedUrlKey } from "./normalizeUrl.ts";

describe("normalizeUrl", () => {
  it("parses a full URL into origin, pathname, and search", () => {
    const result = normalizeUrl("http://localhost:5173/about?page=1");
    expect(result).toEqual({
      origin: "http://localhost:5173",
      pathname: "/about",
      search: "?page=1",
    });
  });

  it("omits hash from normalized representation", () => {
    const result = normalizeUrl("http://localhost:5173/about#section");
    expect(result?.pathname).toBe("/about");
    expect(result?.search).toBe("");
  });

  it("returns null for invalid URLs", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("://")).toBeNull();
  });

  it("handles root path", () => {
    const result = normalizeUrl("http://localhost:5173/");
    expect(result).toEqual({
      origin: "http://localhost:5173",
      pathname: "/",
      search: "",
    });
  });

  it("handles URL with search but no hash", () => {
    const result = normalizeUrl("http://localhost:5173/search?q=test");
    expect(result).toEqual({
      origin: "http://localhost:5173",
      pathname: "/search",
      search: "?q=test",
    });
  });

  it("handles URL with both hash and search", () => {
    const result = normalizeUrl("http://localhost:5173/search?q=test#results");
    expect(result).toEqual({
      origin: "http://localhost:5173",
      pathname: "/search",
      search: "?q=test",
    });
  });
});

describe("normalizedUrlKey", () => {
  it("produces the same key for URLs differing only in hash", () => {
    const a = normalizeUrl("http://localhost:5173/about#one");
    const b = normalizeUrl("http://localhost:5173/about#two");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(normalizedUrlKey(a!)).toBe(normalizedUrlKey(b!));
  });

  it("produces different keys for different paths", () => {
    const a = normalizeUrl("http://localhost:5173/about");
    const b = normalizeUrl("http://localhost:5173/contact");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(normalizedUrlKey(a!)).not.toBe(normalizedUrlKey(b!));
  });

  it("produces different keys for different search params", () => {
    const a = normalizeUrl("http://localhost:5173/about?tab=1");
    const b = normalizeUrl("http://localhost:5173/about?tab=2");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(normalizedUrlKey(a!)).not.toBe(normalizedUrlKey(b!));
  });

  it("produces different keys for different origins", () => {
    const a = normalizeUrl("http://localhost:5173/page");
    const b = normalizeUrl("http://other-site:3000/page");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(normalizedUrlKey(a!)).not.toBe(normalizedUrlKey(b!));
  });

  it("produces the same key for a directory URL and its index file", () => {
    // The standalone server maps / to index.html; users open either form.
    const root = normalizeUrl("http://localhost:4177/");
    const indexFile = normalizeUrl("http://localhost:4177/index.html");
    expect(root).not.toBeNull();
    expect(indexFile).not.toBeNull();
    expect(normalizedUrlKey(root!)).toBe(normalizedUrlKey(indexFile!));

    const nestedA = normalizeUrl("http://localhost:4177/docs/");
    const nestedB = normalizeUrl("http://localhost:4177/docs/index.htm");
    expect(normalizedUrlKey(nestedA!)).toBe(normalizedUrlKey(nestedB!));

    const page = normalizeUrl("http://localhost:4177/about.html");
    const other = normalizeUrl("http://localhost:4177/about");
    expect(normalizedUrlKey(page!)).not.toBe(normalizedUrlKey(other!));
  });
});
