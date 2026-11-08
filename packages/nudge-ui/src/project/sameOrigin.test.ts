import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "./sameOrigin.ts";

const request = (headers: Record<string, string>): IncomingMessage => ({ headers }) as unknown as IncomingMessage;

describe("isSameOriginRequest", () => {
  it("accepts a request with no Origin, which is not from a page", () => {
    expect(isSameOriginRequest(request({ host: "localhost:4301" }))).toBe(true);
  });

  it("accepts an Origin that matches Host", () => {
    expect(isSameOriginRequest(request({ origin: "http://localhost:4301", host: "localhost:4301" }))).toBe(true);
  });

  it("accepts the page's host forwarded by the Next.js rewrite", () => {
    expect(isSameOriginRequest(request({
      origin: "http://localhost:4301",
      host: "127.0.0.1:53127",
      "x-forwarded-host": "localhost:4301",
    }))).toBe(true);
  });

  it("refuses another site, even with a forwarded host of its own", () => {
    expect(isSameOriginRequest(request({ origin: "https://evil.example", host: "localhost:4301" }))).toBe(false);
    expect(isSameOriginRequest(request({ origin: "http://localhost:3000", host: "127.0.0.1:53127", "x-forwarded-host": "localhost:4301" }))).toBe(false);
  });

  it("refuses an Origin it cannot parse", () => {
    expect(isSameOriginRequest(request({ origin: "not a url", host: "localhost:4301" }))).toBe(false);
  });
});
