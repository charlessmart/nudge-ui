import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defaultBridgePort } from "@nudge-ui/agent-protocol";
import { openPairedPage, parseCliArguments, type PageLaunchDependencies } from "./cli.ts";

describe("nudge-mcp CLI", () => {
  it("derives a stable project identity and discovery port without requiring an origin", () => {
    const options = parseCliArguments([], {
      INIT_CWD: "/workspace/product-site",
    });

    expect(options).toMatchObject({
      projectId: "product-site",
      workspaceRoot: "/workspace/product-site",
      origin: undefined,
      port: defaultBridgePort("product-site"),
    });
  });

  it("opens a reachable page through the platform URL handler", async () => {
    const unref = vi.fn();
    const spawn = vi.fn(() => ({ unref }));
    const warn = vi.fn();
    const dependencies: PageLaunchDependencies = {
      fetch: vi.fn(async () => new Response("ok")) as typeof fetch,
      platform: "darwin",
      spawn,
      warn,
    };

    await expect(openPairedPage("http://localhost:5173/landing", dependencies)).resolves.toBe(true);
    expect(spawn).toHaveBeenCalledWith(
      "open",
      ["http://localhost:5173/landing"],
      { detached: true, stdio: "ignore" },
    );
    expect(unref).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it("leaves a useful manual URL when the remembered dev page is unavailable", async () => {
    const warn = vi.fn();
    const dependencies: PageLaunchDependencies = {
      fetch: vi.fn(async () => new Response("missing", { status: 404 })) as typeof fetch,
      platform: "linux",
      spawn: vi.fn(() => ({ unref: vi.fn() })),
      warn,
    };

    await expect(openPairedPage("http://localhost:5173/missing", dependencies)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("open http://localhost:5173/missing manually"));
    expect(dependencies.spawn).not.toHaveBeenCalled();
  });

  it("invokes runCli explicitly from the bin entry instead of relying on module auto-run", async () => {
    const bin = await readFile(fileURLToPath(new URL("../bin/nudge-mcp.mjs", import.meta.url)), "utf8");
    expect(bin).toMatch(/runCli\(/);
  });
});
