import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseLibraryVisibility, withLibraryVisibility } from "../transport/library.ts";
import { handleLibraryVisibilityRequest, readLibraryVisibility } from "./libraryVisibility.ts";

describe("library visibility file", () => {
  it("accepts only version 1 with string ids, sorted and de-duplicated", () => {
    expect(parseLibraryVisibility({ version: 1, hidden: ["b", "a", "a"], shown: ["c"] })).toEqual({ version: 1, hidden: ["a", "b"], shown: ["c"] });
    expect(parseLibraryVisibility({ version: 2, hidden: [], shown: [] })).toBeNull();
    expect(parseLibraryVisibility({ version: 1, hidden: [1], shown: [] })).toBeNull();
    expect(parseLibraryVisibility({ version: 1, hidden: [""], shown: [] })).toBeNull();
    expect(parseLibraryVisibility([])).toBeNull();
    expect(parseLibraryVisibility({ version: 1 })).toEqual({ version: 1, hidden: [], shown: [] });
  });

  it("lets hidden win when an id is in both lists", () => {
    expect(parseLibraryVisibility({ version: 1, hidden: ["a"], shown: ["a", "b"] })).toEqual({ version: 1, hidden: ["a"], shown: ["b"] });
  });

  it("records one call and drops the opposite one", () => {
    const start = { version: 1 as const, hidden: ["a"], shown: ["b"] };
    expect(withLibraryVisibility(start, "a", "shown")).toEqual({ version: 1, hidden: [], shown: ["a", "b"] });
    expect(withLibraryVisibility(start, "b", "hidden")).toEqual({ version: 1, hidden: ["a", "b"], shown: [] });
    expect(withLibraryVisibility(start, "a", "detected")).toEqual({ version: 1, hidden: [], shown: ["b"] });
  });
});

describe("handleLibraryVisibilityRequest", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "nudge-ui-library-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  function call(method: string, body?: unknown, headers: Record<string, string> = {}, url = "/__nudge_ui__/library") {
    const request = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), {
      method, url, headers: { host: "localhost:5173", ...headers },
    }) as unknown as IncomingMessage;
    const result = { status: 0, body: "" };
    const response = {
      writeHead(status: number) { result.status = status; return this; },
      end(content: string) { result.body = content; },
    } as unknown as ServerResponse;
    return handleLibraryVisibilityRequest(request, response, root).then((handled) => ({ handled, ...result }));
  }

  it("ignores other routes", async () => {
    expect((await call("GET", undefined, {}, "/other")).handled).toBe(false);
  });

  it("starts empty and persists what the client saves under .nudge", async () => {
    expect(await readLibraryVisibility(root)).toEqual({ version: 1, hidden: [], shown: [] });
    const saved = await call("PUT", { version: 1, hidden: ["x#Y"], shown: [] });
    expect(saved.status).toBe(200);
    expect(JSON.parse(await readFile(join(root, ".nudge", "library.json"), "utf8"))).toEqual({ version: 1, hidden: ["x#Y"], shown: [] });
    expect(JSON.parse((await call("GET")).body)).toEqual({ version: 1, hidden: ["x#Y"], shown: [] });
  });

  it("rejects bad bodies, cross-origin writes and other methods", async () => {
    expect((await call("PUT", { version: 9 })).status).toBe(400);
    expect((await call("PUT", { version: 1, hidden: [], shown: [] }, { origin: "http://evil.example" })).status).toBe(403);
    expect((await call("DELETE")).status).toBe(405);
  });

  it("reads a damaged file as empty rather than failing", async () => {
    await call("PUT", { version: 1, hidden: ["a"], shown: [] });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(root, ".nudge", "library.json"), "{not json");
    expect(await readLibraryVisibility(root)).toEqual({ version: 1, hidden: [], shown: [] });
  });
});
