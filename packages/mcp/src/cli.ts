import { resolve } from "node:path";
import { diagnoseProjectSessions, discoverProjectSessions } from "./discovery.ts";
import { createDiscoveredAgentAdapter } from "./server.ts";

export interface CliOptions {
  readonly command: "serve" | "doctor";
  readonly workspaceRoot?: string;
  readonly help: boolean;
}

export type CliEnvironment = Readonly<Record<string, string | undefined>>;

const REMOVED_OPTIONS = new Set(["--origin", "--project-id", "--host", "--port", "--command-timeout-ms", "--workspace-root"]);
const REMOVED_ENVIRONMENT = [
  "NUDGE_UI_PROJECT_ID",
  "NUDGE_UI_ORIGIN",
  "NUDGE_UI_WORKSPACE_ROOT",
  "NUDGE_UI_BRIDGE_HOST",
  "NUDGE_UI_BRIDGE_PORT",
  "NUDGE_UI_COMMAND_TIMEOUT_MS",
] as const;

function removedConfiguration(name: string): TypeError {
  return new TypeError(`${name} configured the removed coupled or startup-workspace mode. Rerun \`npx nudge-ui agent setup\` in the project to register the reusable adapter.`);
}

function valueAfter(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new TypeError(`${flag} requires a value`);
  return value;
}

/** Serving takes no options; `doctor` accepts a diagnostic scope. */
export function parseCliArguments(
  argv: readonly string[] = process.argv.slice(2),
  environment: CliEnvironment = process.env,
): CliOptions {
  const command = argv[0] === "doctor" ? "doctor" : "serve";
  const argumentsToParse = command === "doctor" ? argv.slice(1) : argv;
  let workspaceRoot: string | undefined;
  let help = false;

  for (let index = 0; index < argumentsToParse.length; index += 1) {
    const argument = argumentsToParse[index]!;
    if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (command === "doctor" && argument === "--workspace-root") {
      workspaceRoot = resolve(valueAfter(argumentsToParse, index, argument));
      index += 1;
    } else if (REMOVED_OPTIONS.has(argument)) {
      throw removedConfiguration(argument);
    } else {
      throw new TypeError(`Unknown option ${argument}`);
    }
  }
  if (command === "serve") {
    const removed = REMOVED_ENVIRONMENT.find((name) => environment[name] !== undefined);
    if (removed) throw removedConfiguration(removed);
  }
  return { command, ...(workspaceRoot === undefined ? {} : { workspaceRoot }), help };
}

export const CLI_USAGE = `Usage: nudge-mcp [doctor] [options]

Starts a standard MCP stdio adapter that discovers the bridges owned by running
projects. Every tool call names the checkout or application it targets.

Options:
  --workspace-root <path>       doctor only: limit diagnostics to one checkout or application
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
  if (options.command === "doctor") {
    const sessions = await discoverProjectSessions(options.workspaceRoot);
    const matches = sessions.filter((session) => options.workspaceRoot === undefined || session.matchesApplication);
    const diagnostics = await diagnoseProjectSessions(options.workspaceRoot);
    process.stdout.write([
      `[nudge-ui] registry: ${diagnostics.registryRoot}`,
      `[nudge-ui] workspace: ${diagnostics.workspaceRoot ?? "all projects"}`,
      `[nudge-ui] application: ${diagnostics.applicationRoot ?? "all applications"}`,
      `[nudge-ui] descriptors: ${diagnostics.descriptorCount}; invalid: ${diagnostics.invalidCount}; incompatible: ${diagnostics.incompatibleCount}`,
      `[nudge-ui] matching unreachable descriptors: ${diagnostics.matchingUnreachableCount}`,
      ...diagnostics.guidance.map((message) => `[nudge-ui] ${message}`),
      `[nudge-ui] live sessions: ${sessions.length}`,
      `[nudge-ui] matching sessions: ${matches.length}`,
      ...(matches.length === 0
        ? ["[nudge-ui] no reachable compatible bridge matches; inspect the diagnostics above or start the development server"]
        : matches.map((session) => {
          const state = session.status.connection === "delivered"
            ? "awaiting acknowledgment"
            : session.status.connection === "working"
            ? "working"
            : session.status.listenerActive ? "listening" : "available";
          return `[nudge-ui] ${state}: ${session.projectId} (${session.origin})${session.claimed ? " [claimed]" : ""}`;
        })),
    ].join("\n") + "\n");
    return;
  }
  const adapter = createDiscoveredAgentAdapter();
  let stopping = false;
  let resolveAdapterWait: (() => void) | null = null;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    void adapter.close();
    resolveAdapterWait?.();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await adapter.start();
    await new Promise<void>((resolveAdapter) => {
      const finish = (): void => resolveAdapter();
      // Keep a direct resolver so signal handlers terminate even though
      // installing a signal handler suppresses Node's default process exit.
      resolveAdapterWait = finish;
      process.stdin.once("end", finish);
      process.once("exit", finish);
    });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await adapter.close();
  }
}
