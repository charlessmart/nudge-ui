import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { basename, resolve } from "node:path";
import { defaultBridgePort } from "@nudge-ui/agent-protocol";
import { createAgentCompanion, type AgentCompanion } from "./server.ts";

export interface CliOptions {
  readonly projectId: string;
  readonly origin?: string;
  readonly workspaceRoot: string;
  readonly host: "127.0.0.1" | "::1" | "localhost";
  readonly port: number;
  readonly commandTimeoutMs: number;
  readonly help: boolean;
}

export interface CliEnvironment {
  readonly CI?: string;
  readonly INIT_CWD?: string;
  readonly NUDGE_UI_PROJECT_ID?: string;
  readonly NUDGE_UI_ORIGIN?: string;
  readonly NUDGE_UI_WORKSPACE_ROOT?: string;
  readonly NUDGE_UI_BRIDGE_HOST?: string;
  readonly NUDGE_UI_BRIDGE_PORT?: string;
  readonly NUDGE_UI_COMMAND_TIMEOUT_MS?: string;
}

const DEFAULT_PORT = 0;
const DEFAULT_COMMAND_TIMEOUT_MS = 5_000;
const PAGE_PROBE_TIMEOUT_MS = 1_500;

export interface PageLaunchDependencies {
  readonly fetch: typeof fetch;
  readonly platform: NodeJS.Platform;
  readonly spawn: (
    command: string,
    args: readonly string[],
    options: { detached: true; stdio: "ignore" },
  ) => Pick<ChildProcess, "unref">;
  readonly warn: (message: string) => void;
}

const PAGE_LAUNCH_DEPENDENCIES: PageLaunchDependencies = {
  fetch: globalThis.fetch,
  platform: process.platform,
  spawn: (command, args, options) => spawn(command, args, options),
  warn: (message) => process.stderr.write(`${message}\n`),
};

/** Opens a reachable paired project page using the platform URL handler. */
export async function openPairedPage(
  pageUrl: string,
  dependencies: PageLaunchDependencies = PAGE_LAUNCH_DEPENDENCIES,
): Promise<boolean> {
  try {
    const response = await dependencies.fetch(pageUrl, {
      method: "GET",
      signal: AbortSignal.timeout(PAGE_PROBE_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`page returned ${response.status}`);
    const command = dependencies.platform === "darwin"
      ? { executable: "open", args: [pageUrl] }
      : dependencies.platform === "win32"
        ? { executable: "cmd", args: ["/c", "start", "", pageUrl] }
        : { executable: "xdg-open", args: [pageUrl] };
    const child = dependencies.spawn(command.executable, command.args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return true;
  } catch (error) {
    const detail = error instanceof Error ? ` (${error.message})` : "";
    dependencies.warn(`[nudge-ui] paired page is unavailable${detail}; open ${pageUrl} manually`);
    return false;
  }
}

function projectIdFor(root: string): string {
  const name = basename(root);
  return name.length > 0 ? name : `project-${createHash("sha256").update(root).digest("hex").slice(0, 24)}`;
}

function valueAfter(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new TypeError(`${flag} requires a value`);
  return value;
}

function parseInteger(value: string, flag: string, maximum: number): number {
  if (!/^\d+$/.test(value)) throw new TypeError(`${flag} must be a non-negative integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) throw new TypeError(`${flag} is out of range`);
  return parsed;
}

/** Parses only project-scoped, host-neutral CLI options. */
export function parseCliArguments(
  argv: readonly string[] = process.argv.slice(2),
  environment: CliEnvironment = process.env,
): CliOptions {
  const root = resolve(environment.NUDGE_UI_WORKSPACE_ROOT ?? environment.INIT_CWD ?? process.cwd());
  let projectId = environment.NUDGE_UI_PROJECT_ID ?? projectIdFor(root);
  let origin = environment.NUDGE_UI_ORIGIN;
  // SAFETY: CliOptions is the tokenized owner of this env var, and its host domain is the only accepted set.
  let host = (environment.NUDGE_UI_BRIDGE_HOST ?? "127.0.0.1") as CliOptions["host"];
  let port = environment.NUDGE_UI_BRIDGE_PORT === undefined
    ? DEFAULT_PORT
    : parseInteger(environment.NUDGE_UI_BRIDGE_PORT, "NUDGE_UI_BRIDGE_PORT", 65_535);
  let commandTimeoutMs = environment.NUDGE_UI_COMMAND_TIMEOUT_MS === undefined
    ? DEFAULT_COMMAND_TIMEOUT_MS
    : parseInteger(environment.NUDGE_UI_COMMAND_TIMEOUT_MS, "NUDGE_UI_COMMAND_TIMEOUT_MS", 60_000);
  let workspaceRoot = root;
  let help = false;
  let explicitPort = environment.NUDGE_UI_BRIDGE_PORT !== undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--help":
      case "-h":
        help = true;
        break;
      case "--project-id":
        projectId = valueAfter(argv, index, argument);
        index += 1;
        break;
      case "--origin":
        origin = valueAfter(argv, index, argument);
        index += 1;
        break;
      case "--workspace-root":
        workspaceRoot = resolve(valueAfter(argv, index, argument));
        index += 1;
        break;
      case "--host": {
        const candidate = valueAfter(argv, index, argument);
        if (candidate !== "127.0.0.1" && candidate !== "::1" && candidate !== "localhost") {
          throw new TypeError("--host must be 127.0.0.1, ::1, or localhost");
        }
        host = candidate;
        index += 1;
        break;
      }
      case "--port":
        port = parseInteger(valueAfter(argv, index, argument), argument, 65_535);
        explicitPort = true;
        index += 1;
        break;
      case "--command-timeout-ms":
        commandTimeoutMs = parseInteger(valueAfter(argv, index, argument), argument, 60_000);
        if (commandTimeoutMs === 0) throw new TypeError("--command-timeout-ms must be greater than zero");
        index += 1;
        break;
      default:
        throw new TypeError(`Unknown option ${argument}`);
    }
  }
  if (projectId.length === 0 || projectId.length > 256) throw new TypeError("--project-id must be a bounded non-empty string");
  if (!explicitPort) port = defaultBridgePort(projectId);
  return { projectId, origin, workspaceRoot, host, port, commandTimeoutMs, help };
}

export const CLI_USAGE = `Usage: nudge-mcp [options]

Starts a project-scoped standard MCP stdio server and loopback browser bridge.

Options:
  --project-id <id>             Stable project pairing identity
  --origin <origin>             Exact app origin required for browser pairing
  --workspace-root <path>       Project root supplied to the agent
  --host <loopback>             127.0.0.1, ::1, or localhost
  --port <port>                 Bridge port; default is deterministic per project, 0 is ephemeral
  --command-timeout-ms <ms>     Canvas acknowledgement timeout
  --help                        Show this message
`;

/** Runs the CLI until the stdio MCP connection closes or the process stops. */
export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
  environment: CliEnvironment = process.env,
): Promise<void> {
  const options = parseCliArguments(argv, environment);
  if (options.help) {
    process.stdout.write(CLI_USAGE);
    return;
  }
  const companion: AgentCompanion = createAgentCompanion({
    ...options,
    onControllerUnavailable: (pageUrl) => openPairedPage(pageUrl).then(() => undefined),
  });
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    void companion.close();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const started = await companion.start();
    // stdout belongs to MCP stdio. Keep discovery information on stderr so it
    // can be observed by a host without corrupting JSON-RPC framing.
    process.stderr.write(`[nudge-ui] browser bridge listening at ${started.address.url}\n`);
    await new Promise<void>((resolveWait) => {
      const close = (): void => resolveWait();
      companion.bridge.httpServer.once("close", close);
      process.once("exit", close);
    });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await companion.close();
  }
}
