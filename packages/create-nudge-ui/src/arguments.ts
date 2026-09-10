import { frameworks, packageManagers, type Framework, type PackageManager } from "./types.ts";

export interface CliOptions {
  readonly framework?: Framework;
  readonly packageManager?: PackageManager;
  readonly dryRun: boolean;
  readonly help: boolean;
}

/** Parses the initializer command line. */
export function parseArguments(args: readonly string[]): CliOptions {
  let framework: Framework | undefined;
  let packageManager: PackageManager | undefined;
  let dryRun = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--") continue;
    if (argument === "--dry-run") dryRun = true;
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
  return { framework, packageManager, dryRun, help };
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
