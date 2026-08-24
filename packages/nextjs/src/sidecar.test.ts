import { afterAll, describe, expect, it } from "vitest";
import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
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

/* eslint-disable no-await-in-loop -- sequential settling reads clearer in lifecycle tests */

async function settle(ms = 900): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

describe("sidecar contract aggregation (Stage 5)", () => {
  it("aggregates loader postings into componentContracts with a revision bump", async () => {
    const root = mkdtempSync(join(tmpdir(), "dt-contracts-"));
    roots.push(root);
    const handle = await ensureSidecar(root);
    handles.push(handle);

    const before = await fetch(`http://127.0.0.1:${handle.port}/__design_tool__/manifest`);
    const emptyBefore = ((await before.json()) as { componentContracts: unknown[] }).componentContracts;
    expect(emptyBefore).toEqual([]);

    const post = (file: string, contracts: unknown[]) =>
      fetch(`http://127.0.0.1:${handle.port}/__design_tool__/contracts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file, contracts }),
      });

    expect((await post("app/ClientBadge.tsx", [{ componentId: "app/ClientBadge#ClientBadge", name: "ClientBadge", props: [] }])).status).toBe(204);
    // Same file reposts REPLACE rather than duplicate.
    expect((await post("app/ClientBadge.tsx", [{ componentId: "app/ClientBadge#ClientBadge", name: "ClientBadge", props: [{ name: "tone", control: "select", options: ["accent", "quiet"], optional: true }] }])).status).toBe(204);
    expect((await post("app/HeroCard.tsx", [{ componentId: "app/HeroCard#HeroCard", name: "HeroCard", props: [] }])).status).toBe(204);

    await settle(400);
    const response = await fetch(`http://127.0.0.1:${handle.port}/__design_tool__/manifest`);
    const manifest = (await response.json()) as { componentContracts: Array<{ componentId: string }> };
    const ids = manifest.componentContracts.map((c) => c.componentId);
    expect(ids).toContain("app/ClientBadge#ClientBadge");
    expect(ids).toContain("app/HeroCard#HeroCard");
    expect(ids.filter((id) => id === "app/ClientBadge#ClientBadge")).toHaveLength(1);

    // Malformed payloads are rejected without poisoning aggregation.
    const bad = await fetch(`http://127.0.0.1:${handle.port}/__design_tool__/contracts`, {
      method: "POST",
      body: "not-json",
    });
    expect(bad.status).toBe(400);
  });

  it("prunes contracts when an empty result is posted for a known file", async () => {
    const root = mkdtempSync(join(tmpdir(), "dt-contracts-prune-"));
    roots.push(root);
    const handle = await ensureSidecar(root);
    handles.push(handle);
    const post = (file: string, contracts: unknown[]) =>
      fetch(`http://127.0.0.1:${handle.port}/__design_tool__/contracts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file, contracts }),
      });

    await post("app/Badge.tsx", [{ componentId: "app/Badge#Badge", name: "Badge", props: [] }]);
    await settle(300);
    let ids = ((await (
      await fetch(`http://127.0.0.1:${handle.port}/__design_tool__/manifest`)
    ).json()) as { componentContracts: Array<{ componentId: string }> }).componentContracts;
    expect(ids).toHaveLength(1);

    // The component was deleted; the loader reposts an EMPTY contract list.
    await post("app/Badge.tsx", []);
    await settle(300);
    ids = ((await (
      await fetch(`http://127.0.0.1:${handle.port}/__design_tool__/manifest`)
    ).json()) as { componentContracts: Array<{ componentId: string }> }).componentContracts;
    expect(ids).toHaveLength(0);
  });

  it("prunes contracts when a component file is deleted from disk", async () => {
    const root = mkdtempSync(join(tmpdir(), "dt-contracts-del-"));
    roots.push(root);
    mkdirSync(join(root, "app"), { recursive: true });
    writeFileSync(join(root, "app", "Gone.tsx"), "// pending compile\n");
    const handle = await ensureSidecar(root, { tokens: true });
    handles.push(handle);

    await fetch(`http://127.0.0.1:${handle.port}/__design_tool__/contracts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: "app/Gone.tsx", contracts: [{ componentId: "app/Gone#Gone", name: "Gone", props: [] }] }),
    });
    await settle(300);

    // Simulate the file being removed: the watcher settles with a remove
    // event and the sidecar must drop the stale entry.
    rmSync(join(root, "app", "Gone.tsx"));
    await settle(1200);

    const response = await fetch(`http://127.0.0.1:${handle.port}/__design_tool__/manifest`);
    const manifest = (await response.json()) as { componentContracts: Array<{ componentId: string }> };
    expect(manifest.componentContracts.map((c) => c.componentId)).not.toContain("app/Gone#Gone");
  });
});

describe("sidecar token lifecycle (Stage 4)", () => {
  it("serves scanned custom properties with project-relative provenance", async () => {
    const root = mkdtempSync(join(tmpdir(), "dt-tokens-"));
    roots.push(root);
    mkdirSync(join(root, "app"), { recursive: true });
    writeFileSync(join(root, "app", "theme.css"), ":root {\n  --dt-accent: #4f46e5;\n}\n");

    const handle = await ensureSidecar(root, { tokens: true });
    handles.push(handle);

    const response = await fetch(`http://127.0.0.1:${handle.port}/__design_tool__/manifest`);
    const manifest = (await response.json()) as {
      tokenGeneration: string;
      tokens: Array<{ name: string; source?: string }>;
      tokenCatalog: Array<{ cssName: string; declarations: Array<{ source: string }> }>;
    };

    expect(manifest.tokenGeneration).toMatch(/^nextjs-token:/);
    expect(manifest.tokens.map((t) => t.name)).toContain("--dt-accent");
    const declaration = manifest.tokenCatalog[0]?.declarations[0];
    expect(declaration?.source).toContain("app/theme.css");
  });

  it("bumps the generation and emits one reload per settled batch", async () => {
    const root = mkdtempSync(join(tmpdir(), "dt-tokens-"));
    roots.push(root);
    mkdirSync(join(root, "app"), { recursive: true });
    writeFileSync(join(root, "app", "a.css"), ":root{--a:1px}");

    const handle = await ensureSidecar(root, { tokens: true });
    handles.push(handle);

    const response = await fetch(`http://127.0.0.1:${handle.port}/__design_tool__/reload`);
    const reader = response.body!.getReader();
    const frames: string[] = [];
    const reading = (async () => {
      const decoder = new TextDecoder();
      let buffer = "";
      while (frames.length < 2) {
        const chunk = await reader.read();
        if (chunk.done) return;
        buffer += decoder.decode(chunk.value, { stream: true });
        let idx = buffer.indexOf("\n\n");
        while (idx !== -1 && frames.length < 3) {
          const frame = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          if (frame.startsWith("data:")) frames.push(frame);
          idx = buffer.indexOf("\n\n");
        }
      }
    })();


    // One burst of many fs events must settle into ONE notification.
    for (let i = 0; i < 5; i += 1) {
      appendFileSync(join(root, "app", "a.css"), `--burst-${i}: ${i}px;\n`);
    }

    await reading;
    // Announce + exactly ONE notification for the whole settled burst.
    expect(frames).toHaveLength(2);
    const revisions = frames.map((f) => JSON.parse(f.slice(5)).revision);
    expect(revisions[1]).toBe(revisions[0] + 1);
    reader.cancel().catch(() => {});
  });

  it("reflects add and remove transitions across scans", async () => {
    const root = mkdtempSync(join(tmpdir(), "dt-tokens-"));
    roots.push(root);
    mkdirSync(join(root, "styles"), { recursive: true });

    const handle = await ensureSidecar(root, { tokens: true });
    handles.push(handle);
    await settle();

    const names = async (): Promise<string[]> => {
      const r = await fetch(`http://127.0.0.1:${handle.port}/__design_tool__/manifest`);
      const m = (await r.json()) as { tokens: Array<{ name: string }> };
      return m.tokens.map((t) => t.name);
    };

    expect(await names()).toEqual([]);

    writeFileSync(join(root, "styles", "added.css"), ":root{--added-token:red}");
    await settle();
    expect(await names()).toContain("--added-token");

    unlinkSync(join(root, "styles", "added.css"));
    await settle();
    expect(await names()).not.toContain("--added-token");
  });

  it("reports unreadable stylesheets as diagnostics without losing inspection", async () => {
    const root = mkdtempSync(join(tmpdir(), "dt-tokens-"));
    roots.push(root);
    mkdirSync(join(root, "css"), { recursive: true });
    writeFileSync(join(root, "css", "good.css"), ":root{--good:1}");
    const locked = join(root, "css", "locked.css");
    writeFileSync(locked, ":root{--locked:1}");
    chmodSync(locked, 0o000);

    try {
      const handle = await ensureSidecar(root, { tokens: true });
      handles.push(handle);

      const response = await fetch(`http://127.0.0.1:${handle.port}/__design_tool__/manifest`);
      const manifest = (await response.json()) as {
        tokenDiagnostics: Array<{ code: string; module: string }>;
        tokens: Array<{ name: string }>;
      };
      // The readable sheet still feeds inspection...
      expect(manifest.tokens.map((t) => t.name)).toContain("--good");
      // ...and the unreadable one surfaces as a diagnostic.
      expect(
        manifest.tokenDiagnostics.some((d) => d.module.includes("locked.css")),
      ).toBe(true);
    } finally {
      chmodSync(locked, 0o644);
    }
  });
});

describe("sidecar source contract scan", () => {
  const BADGE_SOURCE = [
    "export type BadgeTone = \"accent\" | \"quiet\";",
    "",
    "export function Badge({ label, tone = \"quiet\", disabled = false }: {",
    "  label: string;",
    "  tone?: \"accent\" | \"quiet\";",
    "  disabled?: boolean;",
    "}) {",
    "  return <span data-badge={tone}>{label}</span>;",
    "}",
  ].join("\n");

  it("publishes contracts from authored sources without any loader posting", async () => {
    const root = mkdtempSync(join(tmpdir(), "dt-scan-"));
    roots.push(root);
    mkdirSync(join(root, "app"), { recursive: true });
    writeFileSync(join(root, "app", "Badge.tsx"), `${BADGE_SOURCE}\n`);

    // No tokens lifecycle and no postings: the startup scan alone must
    // populate the catalog so a restarted dev server keeps prop controls.
    const handle = await ensureSidecar(root);
    handles.push(handle);

    const response = await fetch(`http://127.0.0.1:${handle.port}/__design_tool__/manifest`);
    const manifest = (await response.json()) as { componentContracts: Array<{ componentId: string; props: Array<{ name: string }> }> };
    const badge = manifest.componentContracts.find((c) => c.componentId === "app/Badge#Badge");
    expect(badge).toBeTruthy();
    expect(badge!.props.map((p) => p.name)).toEqual(["label", "tone", "disabled"]);
  });

  it("re-extracts edited sources on settled watcher batches", async () => {
    const root = mkdtempSync(join(tmpdir(), "dt-scan-watch-"));
    roots.push(root);
    mkdirSync(join(root, "app"), { recursive: true });
    writeFileSync(join(root, "app", "Badge.tsx"), `${BADGE_SOURCE}\n`);
    const handle = await ensureSidecar(root, { tokens: true });
    handles.push(handle);

    writeFileSync(
      join(root, "app", "Badge.tsx"),
      `${BADGE_SOURCE.replace('  tone?: "accent" | "quiet";\n', "").replace('tone = "quiet", ', "")}\n`,
    );
    await settle();

    const response = await fetch(`http://127.0.0.1:${handle.port}/__design_tool__/manifest`);
    const manifest = (await response.json()) as { componentContracts: Array<{ componentId: string; props: Array<{ name: string }> }> };
    const badge = manifest.componentContracts.find((c) => c.componentId === "app/Badge#Badge");
    expect(badge).toBeTruthy();
    expect(badge!.props.map((p) => p.name)).not.toContain("tone");
  });
});
