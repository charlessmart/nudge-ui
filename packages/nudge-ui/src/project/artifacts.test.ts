// @vitest-environment node
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleHtmlArtifactRequest } from "./artifacts.ts";

let root: string | null = null;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = null;
});

async function request(method: string, path: string, input?: unknown): Promise<{ status: number; body: string }> {
  const bytes = input === undefined ? [] : [Buffer.from(JSON.stringify(input))];
  const incoming = Readable.from(bytes) as IncomingMessage;
  incoming.method = method;
  incoming.url = path;
  incoming.headers = {};
  let status = 0;
  let body = "";
  const outgoing = {
    writeHead(code: number) { status = code; return this; },
    end(content?: string) { body = content ?? ""; return this; },
  } as unknown as ServerResponse;
  expect(await handleHtmlArtifactRequest(incoming, outgoing, root!)).toBe(true);
  return { status, body };
}

describe("HTML artifact route", () => {
  it("keeps the captured baseline while updating the editable document", async () => {
    root = await mkdtemp(join(tmpdir(), "nudge-artifacts-"));
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const path = "/__nudge_ui__/artifacts";
    const baseline = "<!doctype html><html><body><main>Before</main></body></html>";

    expect((await request("POST", path, {
      id, html: baseline, sourceUrl: "http://localhost/page", title: "Page",
      viewport: { width: 800, height: 600 },
    })).status).toBe(201);
    expect(await readFile(join(root, ".nudge", "artifacts", id, "baseline.html"), "utf8")).toBe(baseline);

    expect((await request("PUT", `${path}/${id}/document`, { html: baseline.replace("Before", "After") })).status).toBe(204);
    expect((await request("GET", `${path}/${id}/baseline`)).body).toContain("Before");
    expect((await request("GET", `${path}/${id}/document`)).body).toContain("After");
    expect((await request("GET", `${path}/${id}/preview`)).body).toContain("Before");
    expect((await request("POST", `${path}/${id}/commit`)).status).toBe(204);
    expect((await request("GET", `${path}/${id}/preview`)).body).toContain("After");
    expect(await readFile(join(root, ".nudge", "artifacts", id, "baseline.html"), "utf8")).toBe(baseline);
    expect((await request("POST", path, {
      id, html: baseline, sourceUrl: "http://localhost/page", title: "Page", viewport: { width: 800, height: 600 },
    })).status).toBe(409);
    expect((await request("PUT", `${path}/invalid/document`, { html: "x" })).status).toBe(404);
  });

  it("detects agent edits on disk and promotes them without changing the original capture", async () => {
    root = await mkdtemp(join(tmpdir(), "nudge-artifacts-"));
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const path = `/__nudge_ui__/artifacts/${id}`;
    const original = "<html><body>Before</body></html>";
    await request("POST", "/__nudge_ui__/artifacts", {
      id, html: original, sourceUrl: "http://localhost/page", title: "Page", viewport: { width: 800, height: 600 },
    });
    await writeFile(join(root, ".nudge", "artifacts", id, "document.html"), "<html><body>Agent iteration</body></html>");
    const revision = JSON.parse((await request("GET", `${path}/revision`)).body);
    expect(revision.document).not.toBe(revision.preview);
    await request("POST", `${path}/commit`);
    expect((await request("GET", `${path}/preview`)).body).toContain("Agent iteration");
    const synced = JSON.parse((await request("GET", `${path}/revision`)).body);
    expect(synced.document).toBe(synced.preview);
    expect(await readFile(join(root, ".nudge", "artifacts", id, "baseline.html"), "utf8")).toBe(original);
  });

});
