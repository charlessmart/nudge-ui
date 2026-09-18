import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, parse } from "node:path";
import { pathToFileURL } from "node:url";

export interface ProjectBridgeBrowserConfig {
  readonly baseUrl: string;
  readonly autoConnect: true;
}

interface ProjectBridgeRuntime {
  readonly browser: {
    readonly projectId: string;
    readonly origin: string;
    readonly bridgeUrl: string;
  };
  close(): Promise<void>;
}

interface ProjectBridgeModule {
  startProjectBridge(options: {
    appRoot: string;
    projectId: string;
    origin: string;
    allowedOrigins?: readonly string[];
  }): Promise<ProjectBridgeRuntime>;
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
    readonly warn?: (message: string) => void;
  },
  key: string,
): Promise<{ browser: ProjectBridgeBrowserConfig; close(): Promise<void> } | null> {
  let modulePath: string;
  try {
    if (!isPnpRuntime() && !hasProjectInstalledMcp(input.appRoot)) {
      runningBridges.delete(key);
      return null;
    }
    modulePath = createRequire(join(input.appRoot, "package.json")).resolve("@nudge-ui/mcp/project");
  } catch {
    runningBridges.delete(key);
    return null;
  }

  try {
    const loaded = await import(pathToFileURL(modulePath).href) as Partial<ProjectBridgeModule>;
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

function isPnpRuntime(): boolean {
  return typeof (process.versions as NodeJS.ProcessVersions & { pnp?: unknown }).pnp === "string";
}

function hasProjectInstalledMcp(appRoot: string): boolean {
  let directory = appRoot;
  const root = parse(directory).root;
  for (;;) {
    if (existsSync(join(directory, "node_modules", "@nudge-ui", "mcp", "package.json"))) return true;
    if (directory === root) return false;
    directory = dirname(directory);
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
