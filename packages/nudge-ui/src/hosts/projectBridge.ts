import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { StartProjectBridge } from "@nudge-ui/agent-protocol";
import { findProjectMcpRoot } from "../project/mcpPackage.ts";

export interface ProjectBridgeBrowserConfig {
  readonly baseUrl: string;
  readonly autoConnect: true;
}

const runningBridges = new Map<
  string,
  Promise<{ browser: ProjectBridgeBrowserConfig; close(): Promise<void> } | null>
>();

/** Starts the optional project bridge installed beside the host application. */
export async function startOptionalProjectBridge(input: {
  readonly appRoot: string;
  readonly projectId: string;
  readonly origin: string;
  readonly allowedOrigins?: readonly string[];
  readonly info?: (message: string) => void;
  readonly warn?: (message: string) => void;
}): Promise<{ browser: ProjectBridgeBrowserConfig; close(): Promise<void> } | null> {
  const key = `${input.appRoot}\u0000${input.origin}`;
  const running = runningBridges.get(key);
  if (running) return running;
  const starting = launchOptionalProjectBridge(input, key);
  runningBridges.set(key, starting);
  void starting.then((bridge) => {
    if (bridge === null && runningBridges.get(key) === starting) runningBridges.delete(key);
  });
  return starting;
}

async function launchOptionalProjectBridge(
  input: {
    readonly appRoot: string;
    readonly projectId: string;
    readonly origin: string;
    readonly allowedOrigins?: readonly string[];
    readonly info?: (message: string) => void;
    readonly warn?: (message: string) => void;
  },
  key: string,
): Promise<{ browser: ProjectBridgeBrowserConfig; close(): Promise<void> } | null> {
  let modulePath: string;
  try {
    if (findProjectMcpRoot(input.appRoot) === null) {
      runningBridges.delete(key);
      return null;
    }
    modulePath = createRequire(join(input.appRoot, "package.json")).resolve("@nudge-ui/mcp/project");
  } catch {
    runningBridges.delete(key);
    return null;
  }

  try {
    const loaded = await import(pathToFileURL(modulePath).href) as { startProjectBridge?: StartProjectBridge };
    if (typeof loaded.startProjectBridge !== "function") {
      throw new Error("the project bridge export is unavailable");
    }
    const runtime = await loaded.startProjectBridge({
      appRoot: input.appRoot,
      projectId: input.projectId,
      origin: input.origin,
      ...(input.allowedOrigins ? { allowedOrigins: input.allowedOrigins } : {}),
    });
    if (runtime.browser.projectId !== input.projectId || runtime.browser.origin !== input.origin) {
      await runtime.close().catch(() => undefined);
      throw new Error("the project bridge returned a different project or origin");
    }
    input.info?.(`[nudge-ui] project bridge ready for ${input.projectId}`);
    let closed = false;
    return {
      browser: { baseUrl: runtime.browser.bridgeUrl, autoConnect: true },
      close: async () => {
        if (closed) return;
        closed = true;
        runningBridges.delete(key);
        await runtime.close();
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    input.warn?.(`[nudge-ui] MCP project bridge failed to start: ${detail}`);
    runningBridges.delete(key);
    return null;
  }
}

/** Returns the browser origin for a loopback HTTP server address. */
export function loopbackOrigin(
  address: { address: string; port: number },
  protocol: "http" | "https" = "http",
): string {
  const host = address.address === "::" || address.address === "::1"
    ? "[::1]"
    : address.address === "0.0.0.0"
      ? "127.0.0.1"
      : address.address;
  return `${protocol}://${host}:${address.port}`;
}
