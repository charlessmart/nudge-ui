import { describe, expect, it } from "vitest";
import { parseServeArguments } from "./cli.ts";

describe("parseServeArguments", () => {
  it("uses the current directory and loopback defaults", () => {
    expect(parseServeArguments(["serve"], "/prototype")).toEqual({
      rootDirectory: "/prototype",
      host: "127.0.0.1",
      port: 4173,
    });
  });

  it("accepts one directory plus explicit loopback and port options", () => {
    expect(parseServeArguments([
      "serve",
      "pages",
      "--host=localhost",
      "--port",
      "0",
    ], "/prototype")).toEqual({
      rootDirectory: "/prototype/pages",
      host: "localhost",
      port: 0,
    });
  });

  it("rejects unsupported commands, public hosts, and invalid ports", () => {
    expect(() => parseServeArguments([], "/prototype")).toThrow(/Usage/);
    expect(() => parseServeArguments([
      "serve",
      "--host",
      "0.0.0.0",
    ], "/prototype")).toThrow(/loopback/);
    expect(() => parseServeArguments([
      "serve",
      "--port",
      "70000",
    ], "/prototype")).toThrow(/integer/);
  });
});
