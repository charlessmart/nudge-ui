import { frameworks, packageManagers, type Framework, type PackageManager } from "./types.ts";

export interface CliOptions {
  readonly framework?: Framework;
  readonly packageManager?: PackageManager;
  readonly agentOnly: boolean;
  readonly agents: readonly string[];
  readonly mcpPackageSpecifier?: string;
  readonly mcp?: boolean;
  readonly yes: boolean;
  readonly dryRun: boolean;
  readonly help: boolean;
}

/** Parses the initializer command line. */
export function parseArguments(args: readonly string[]): CliOptions {
  let framework: Framework | undefined;
  let packageManager: PackageManager | undefined;
  let agentOnly = false;
  const agents: string[] = [];
  let mcpPackageSpecifier: string | undefined;
  let mcp: boolean | undefined;
  let yes = false;
  let dryRun = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--") continue;
    if (index === 0 && argument === "agent" && args[index + 1] === "setup") {
      agentOnly = true;
      index += 1;
      continue;
    }
    if (argument === "--dry-run") dryRun = true;
    else if (argument === "--yes" || argument === "-y") yes = true;
    else if (argument === "--agent-only") agentOnly = true;
    else if (argument === "--mcp") mcp = setMcpPreference(mcp, true);
    else if (argument === "--no-mcp") mcp = setMcpPreference(mcp, false);
    else if (argument === "--agent") agents.push(requiredValue(args, ++index, argument));
    else if (argument.startsWith("--agent=")) agents.push(requiredValue([argument.slice("--agent=".length)], 0, "--agent"));
    else if (argument === "--mcp-package") mcpPackageSpecifier = requiredValue(args, ++index, argument);
    else if (argument.startsWith("--mcp-package=")) mcpPackageSpecifier = requiredValue([argument.slice("--mcp-package=".length)], 0, "--mcp-package");
    else if (argument === "--help" || argument === "-h") help = true;
    else if (argument === "--framework") framework = parseFramework(requiredValue(args, ++index, argument));
    else if (argument.startsWith("--framework=")) framework = parseFramework(argument.slice("--framework=".length));
    else if (argument === "--package-manager") {
      packageManager = parsePackageManager(requiredValue(args, ++index, argument));
    }
    else if (argument.startsWith("--package-manager=")) {
      packageManager = parsePackageManager(argument.slice("--package-manager=".length));
    } else throw new Error(`Unknown option: ${argument}`);
  }
  if (agents.length > 0 && mcp === false) throw new Error("--agent cannot be combined with --no-mcp.");
  if (agentOnly && mcp === false) throw new Error("--agent-only cannot be combined with --no-mcp.");
  return { framework, packageManager, agentOnly, agents, mcpPackageSpecifier, mcp, yes, dryRun, help };
}

function setMcpPreference(current: boolean | undefined, next: boolean): boolean {
  if (current !== undefined && current !== next) throw new Error("--mcp and --no-mcp cannot be combined.");
  return next;
}

function requiredValue(args: readonly string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith("-")) throw new Error(`${option} requires a value.`);
  return value;
}

export const helpText = `Set up Nudge UI in the current project.

Usage: npm create nudge-ui@latest -- [options]

Options:
  --framework <nextjs|astro|vite-react|standalone>
  --package-manager <pnpm|npm|yarn|bun>
  --mcp                         Configure the reusable Nudge MCP adapter
  --no-mcp                      Skip coding-agent setup
  --agent <id>                  Configure a supported agent (repeatable)
  --mcp-package <path|package> Use this MCP package for the project and adapter
  --agent-only                  Install or repair only the agent integration
  -y, --yes                     Accept defaults without prompting
  --dry-run
  -h, --help`;

function parseFramework(value: string | undefined): Framework {
  if (value === "nextjs" || value === "astro" || value === "vite-react" || value === "standalone") return value;
  throw new Error(`--framework must be one of: ${frameworks.join(", ")}.`);
}

function parsePackageManager(value: string | undefined): PackageManager {
  if (value === "pnpm" || value === "npm" || value === "yarn" || value === "bun") return value;
  throw new Error(`--package-manager must be one of: ${packageManagers.join(", ")}.`);
}
