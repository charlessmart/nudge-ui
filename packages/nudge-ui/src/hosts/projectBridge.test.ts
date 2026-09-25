import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startOptionalProjectBridge } from "./projectBridge.ts";

describe("startOptionalProjectBridge", () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function temporaryProject(prefix: string): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), prefix));
    temporaryRoots.push(root);
    return root;
  }

  it("uses the MCP package installed in the application and returns its browser endpoint", async () => {
    const appRoot = await temporaryProject("nudge-project-bridge-");
    const packageRoot = join(appRoot, "node_modules", "@nudge-ui", "mcp");
    await mkdir(packageRoot, { recursive: true });
    await writeFile(join(appRoot, "package.json"), JSON.stringify({ type: "module" }));
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({
      type: "module",
      exports: { "./project": "./project.js" },
    }));
    await writeFile(join(packageRoot, "project.js"), `
      export async function startProjectBridge(options) {
        return {
          browser: {
            projectId: options.projectId,
            origin: options.origin,
            bridgeUrl: "http://127.0.0.1:43123"
          },
          async close() {}
        };
      }
    `);

    const info = vi.fn();
    const bridge = await startOptionalProjectBridge({
      appRoot,
      projectId: "worktree-app",
      origin: "http://localhost:5173",
      info,
    });

    expect(bridge?.browser).toEqual({
      baseUrl: "http://127.0.0.1:43123",
      autoConnect: true,
    });
    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith("[nudge-ui] project bridge ready for worktree-app");
    await bridge?.close();
  });

  it("leaves the inspector available when the MCP package is not installed", async () => {
    const appRoot = await temporaryProject("nudge-project-without-mcp-");
    await writeFile(join(appRoot, "package.json"), "{}");

    await expect(startOptionalProjectBridge({
      appRoot,
      projectId: "without-mcp",
      origin: "http://localhost:5173",
    })).resolves.toBeNull();
  });

  it("retries resolution after MCP is installed into a running project", async () => {
    const appRoot = await temporaryProject("nudge-project-late-mcp-");
    await writeFile(join(appRoot, "package.json"), JSON.stringify({ type: "module" }));
    const input = {
      appRoot,
      projectId: "late-mcp",
      origin: "http://localhost:5173",
    } as const;
    await expect(startOptionalProjectBridge(input)).resolves.toBeNull();

    const packageRoot = join(appRoot, "node_modules", "@nudge-ui", "mcp");
    await mkdir(packageRoot, { recursive: true });
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({
      type: "module",
      exports: { "./project": "./project.js" },
    }));
    await writeFile(join(packageRoot, "project.js"), `
      export async function startProjectBridge(options) {
        return {
          browser: { projectId: options.projectId, origin: options.origin, bridgeUrl: "http://127.0.0.1:43124" },
          async close() {}
        };
      }
    `);

    const bridge = await startOptionalProjectBridge(input);
    expect(bridge?.browser.baseUrl).toBe("http://127.0.0.1:43124");
    await bridge?.close();
  });
});
