import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearStaleSidecarState,
  ensureSidecar,
  type SidecarHandle,
} from "./sidecar.ts";

const handles: SidecarHandle[] = [];
const roots: string[] = [];

afterAll(async () => {
  for (const handle of handles.splice(0)) {
    await handle.close();
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

async function sidecar(): Promise<{ handle: SidecarHandle; root: string }> {
  const root = mkdtempSync(join(tmpdir(), "dt-next-sidecar-"));
  roots.push(root);
  const handle = await ensureSidecar(root);
  handles.push(handle);
  return { handle, root };
}

describe("sidecar transport", () => {
  it("binds loopback only and serves the frozen manifest", async () => {
    const { handle, root } = await sidecar();

    const response = await fetch(`http://127.0.0.1:${handle.port}/__design_tool__/manifest`);
    expect(response.headers.get("content-type")).toContain("application/json");
    const manifest = (await response.json()) as Record<string, unknown>;
    expect(manifest.host).toBe("nextjs-react");
    expect(manifest.projectId).toMatch(/^nextjs:[0-9a-f]{12}$/);

    // The port file records this process for diagnostics.
    const record = JSON.parse(
      readFileSync(join(root, ".next", "design-tool-sidecar.json"), "utf8"),
    ) as { pid: number; port: number };
    expect(record.pid).toBe(process.pid);
    expect(record.port).toBe(handle.port);
  });

  it("is a singleton per process", async () => {
    const first = await sidecar();
    const again = await ensureSidecar(first.root);
    expect(again.port).toBe(first.handle.port);
  });

  it("rejects non-GET manifest requests", async () => {
    const { handle } = await sidecar();
    const response = await fetch(`http://127.0.0.1:${handle.port}/__design_tool__/manifest`, {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(405);
  });

  it("streams SSE reload notifications with revision coalescing", async () => {
    const { handle } = await sidecar();

    const received: Array<{ revision: number }> = [];
    const response = await fetch(`http://127.0.0.1:${handle.port}/__design_tool__/reload`);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body!.getReader();
    const reading = (async () => {
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        if (received.at(-1)?.revision === 2) return;
        const chunk = await reader.read();
        if (chunk.done) return;
        buffer += decoder.decode(chunk.value, { stream: true });
        let newline = buffer.indexOf("\n\n");
        while (newline !== -1 && received.at(-1)?.revision !== 2) {
          const frame = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 2);
          if (frame.startsWith("data:")) received.push(JSON.parse(frame.slice(5)));
          newline = buffer.indexOf("\n\n");
        }
      }
    })();

    handle.publishRevision(1);
    handle.publishRevision(2);

    await reading;
    // Late subscribers first receive the current generation (0), then every
    // bump in order.
    expect(received).toEqual([{ revision: 0 }, { revision: 1 }, { revision: 2 }]);
    reader.cancel().catch(() => {});
  });

  it("clears stale port files from other processes but keeps its own", () => {
    const root = mkdtempSync(join(tmpdir(), "dt-next-sidecar-stale-"));
    mkdirSync(join(root, ".next"), { recursive: true });

    writeFileSync(
      join(root, ".next", "design-tool-sidecar.json"),
      `${JSON.stringify({ pid: process.pid + 99999, port: 1234 })}\n`,
    );
    clearStaleSidecarState(root);
    expect(() => readFileSync(join(root, ".next", "design-tool-sidecar.json"))).toThrow();

    writeFileSync(
      join(root, ".next", "design-tool-sidecar.json"),
      `${JSON.stringify({ pid: process.pid, port: 4321 })}\n`,
    );
    clearStaleSidecarState(root);
    expect(readFileSync(join(root, ".next", "design-tool-sidecar.json"), "utf8")).toContain("4321");

    rmSync(root, { recursive: true, force: true });
  });
});
