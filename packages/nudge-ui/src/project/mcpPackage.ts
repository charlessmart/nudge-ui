import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, parse } from "node:path";

const MCP_PACKAGE = "@nudge-ui/mcp";
const MCP_BIN = "nudge-mcp";

/**
 * Locates the optional MCP package installed for an application. Only the
 * application's own dependency tree counts; a global or unrelated copy never
 * starts a bridge or answers diagnostics for this project.
 */
export function findProjectMcpRoot(appRoot: string): string | null {
  let directory = appRoot;
  const { root } = parse(directory);
  for (;;) {
    const candidate = join(directory, "node_modules", "@nudge-ui", "mcp");
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (directory === root) break;
    directory = dirname(directory);
  }
  if (!isPnpRuntime()) return null;
  try {
    return packageRootOf(createRequire(join(appRoot, "package.json")).resolve(MCP_PACKAGE));
  } catch {
    return null;
  }
}

/** Absolute path of the installed package's `nudge-mcp` executable entry. */
export function projectMcpCliEntry(mcpRoot: string): string | null {
  const bin = readManifest(join(mcpRoot, "package.json"))?.bin;
  const entry = typeof bin === "string" ? bin : isRecord(bin) ? bin[MCP_BIN] : undefined;
  return typeof entry === "string" ? join(mcpRoot, entry) : null;
}

function packageRootOf(entry: string): string | null {
  for (let directory = dirname(entry); ; directory = dirname(directory)) {
    const manifest = join(directory, "package.json");
    if (existsSync(manifest) && readManifest(manifest)?.name === MCP_PACKAGE) return directory;
    if (dirname(directory) === directory) return null;
  }
}

function readManifest(path: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPnpRuntime(): boolean {
  return typeof (process.versions as NodeJS.ProcessVersions & { pnp?: unknown }).pnp === "string";
}
