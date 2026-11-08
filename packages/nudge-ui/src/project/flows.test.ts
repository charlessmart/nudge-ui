import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleFlowsRequest, readFlows } from "./flows.ts";

let root: string;
let server: Server | null = null;

beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "nudge-flows-")); });
afterEach(async () => {
  await new Promise((resolve) => { if (server) server.close(resolve); else resolve(null); });
  server = null;
  await rm(root, { recursive: true, force: true });
});

const flow = (id: string) => ({ version: 1, id, title: id, states: [{ id: "a", label: "A", route: "/" }], edges: [] });

async function write(name: string, content: string): Promise<void> {
  await mkdir(join(root, "nudge/flows"), { recursive: true });
  await writeFile(join(root, "nudge/flows", name), content);
}

async function serve(): Promise<string> {
  server = createServer((request, response) => {
    void handleFlowsRequest(request, response, root).then((handled) => { if (!handled) { response.statusCode = 404; response.end(); } });
  });
  await new Promise<void>((resolve) => { server?.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  return `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
}

describe("readFlows", () => {
  it("is empty before the project is mapped", async () => {
    expect(await readFlows(root)).toEqual({ flows: [], errors: [], status: [] });
  });

  it("lists good flows and says why the others were skipped", async () => {
    await write("a.json", JSON.stringify(flow("a")));
    await write("broken.json", "{");
    await write("dupe.json", JSON.stringify(flow("a")));
    await write("invalid.json", JSON.stringify({ ...flow("b"), version: 9 }));
    await write("ignored.txt", "x");
    const result = await readFlows(root);
    expect(result.flows.map((item) => item.id)).toEqual(["a"]);
    expect(result.errors.map((error) => error.file)).toEqual(["nudge/flows/broken.json", "nudge/flows/dupe.json", "nudge/flows/invalid.json"]);
    expect(result.errors[1]?.message).toContain("already uses");
    expect(result.errors[2]?.message).toContain("version");
  });

  it("refuses a flows directory that links outside the project", async () => {
    const outside = await mkdtemp(join(tmpdir(), "nudge-outside-"));
    await mkdir(join(root, "nudge"));
    await symlink(outside, join(root, "nudge/flows"));
    await expect(readFlows(root)).rejects.toThrow("inside the project");
    await rm(outside, { recursive: true, force: true });
  });
});

describe("handleFlowsRequest", () => {
  const status = { flowId: "a", stateId: "s", ok: false, at: 1, durationMs: 2, message: "m", blocked: ["POST /x"] };

  it("leaves other routes to the host", async () => {
    const base = await serve();
    expect((await fetch(`${base}/__nudge_ui__/flowsy`)).status).toBe(404);
  });

  it("keeps one latest result per state for the agent to read", async () => {
    const base = await serve();
    const post = (body: unknown) => fetch(`${base}/__nudge_ui__/flows/status`, { method: "POST", body: JSON.stringify(body) });
    expect((await post(status)).status).toBe(204);
    await Promise.all([post({ ...status, stateId: "t" }), post({ ...status, ok: true })]);
    const file = JSON.parse(await readFile(join(root, ".nudge/flows-status.json"), "utf8")) as { stateId: string; ok: boolean }[];
    expect(file.map((item) => [item.stateId, item.ok]).sort()).toEqual([["s", true], ["t", false]]);
    const served = await (await fetch(`${base}/__nudge_ui__/flows`)).json() as { status: unknown[] };
    expect(served.status).toHaveLength(2);
  });

  it("forgets results for states that were deleted from the files", async () => {
    await write("a.json", JSON.stringify({ ...flow("a"), states: [{ id: "s", label: "S", route: "/" }, { id: "t", label: "T", route: "/" }] }));
    const base = await serve();
    const post = (body: unknown) => fetch(`${base}/__nudge_ui__/flows/status`, { method: "POST", body: JSON.stringify(body) });
    await post(status);
    await post({ ...status, stateId: "t" });
    await write("a.json", JSON.stringify({ ...flow("a"), states: [{ id: "s", label: "S", route: "/" }] }));
    expect((await (await fetch(`${base}/__nudge_ui__/flows`)).json() as { status: { stateId: string }[] }).status.map((item) => item.stateId)).toEqual(["s"]);
    await post({ ...status, ok: true });
    const file = JSON.parse(await readFile(join(root, ".nudge/flows-status.json"), "utf8")) as { stateId: string }[];
    expect(file.map((item) => item.stateId)).toEqual(["s"]);
  });

  it("refuses malformed results, wrong methods and other origins", async () => {
    const base = await serve();
    const route = `${base}/__nudge_ui__/flows/status`;
    expect((await fetch(route, { method: "POST", body: "{}" })).status).toBe(400);
    expect((await fetch(route)).status).toBe(405);
    expect((await fetch(`${base}/__nudge_ui__/flows`, { method: "DELETE" })).status).toBe(405);
    expect((await fetch(route, { method: "POST", headers: { origin: "https://evil.test" }, body: JSON.stringify(status) })).status).toBe(403);
  });
});
