import type { AgentProjectIdentity } from "@nudge-ui/agent-protocol";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BridgeAddress } from "./bridge.ts";

/** Input supplied to an optional project-local host registrar. */
export interface AgentRegistrarContext {
  readonly project: AgentProjectIdentity;
  readonly bridge: BridgeAddress;
  readonly instructions: string;
}

export interface RegistrationResult {
  readonly registered: boolean;
  readonly reason?: string;
}

/**
 * Registration is deliberately a port. The companion does not edit global
 * editor settings or infer a host-specific config format. A future host can
 * provide a project-local implementation with its own explicit consent and
 * tests, while CI and the default CLI remain side-effect free.
 */
export interface AgentRegistrar {
  register(context: AgentRegistrarContext): Promise<RegistrationResult> | RegistrationResult;
  unregister?(context: AgentRegistrarContext): Promise<void> | void;
}

export function createNoopRegistrar(reason = "automatic registration is disabled"): AgentRegistrar {
  return {
    register: () => ({ registered: false, reason }),
  };
}

export interface RegistrarFileSystem {
  mkdir(path: string, options: { recursive: true }): Promise<void>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
}

const NODE_FILE_SYSTEM: RegistrarFileSystem = {
  mkdir: async (path, options) => { await mkdir(path, options); },
  readFile: async (path, encoding) => readFile(path, encoding),
  writeFile: async (path, data, encoding) => { await writeFile(path, data, encoding); },
};

export interface ProjectLocalCodexRegistrarOptions {
  /** Project root; defaults to INIT_CWD, then the current process directory. */
  readonly projectRoot?: string;
  /** Environment is injectable so CI and skip behaviour are testable. */
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly fileSystem?: RegistrarFileSystem;
  readonly configDirectoryName?: string;
  readonly configFileName?: string;
}

const REGISTRATION_START = "# BEGIN NUDGE UI MCP (managed)";
const REGISTRATION_END = "# END NUDGE UI MCP (managed)";
const CODEX_SERVER_NAME = "nudge_ui";

function tomlString(value: string): string {
  // JSON string escaping is valid for TOML basic strings and avoids hand-built
  // quoting bugs when a workspace path contains a quote or backslash.
  return JSON.stringify(value);
}

function registrationBlock(context: AgentRegistrarContext): string {
  const args = [
    "--no-install",
    "@nudge-ui/mcp",
    "--project-id",
    context.project.projectId,
    ...(context.project.origin === undefined ? [] : ["--origin", context.project.origin]),
    "--workspace-root",
    context.project.workspaceRoot ?? process.cwd(),
  ];
  return [
    REGISTRATION_START,
    `[mcp_servers.${CODEX_SERVER_NAME}]`,
    `command = ${tomlString("npx")}`,
    `args = [${args.map(tomlString).join(", ")}]`,
    "tool_timeout_sec = 86400",
    `# The command is project-scoped; no global Codex config is changed.`,
    REGISTRATION_END,
  ].join("\n");
}

function replaceManagedBlock(contents: string, block: string): string {
  const markerPattern = new RegExp(`${escapeRegExp(REGISTRATION_START)}[\\s\\S]*?${escapeRegExp(REGISTRATION_END)}`, "m");
  if (markerPattern.test(contents)) return contents.replace(markerPattern, block);
  if (contents.length === 0) return `${block}\n`;
  return `${contents.replace(/\s*$/, "")}\n\n${block}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasUnmanagedNudgeTable(contents: string): boolean {
  const tablePattern = new RegExp(`^\\[mcp_servers\\.${escapeRegExp(CODEX_SERVER_NAME)}\\]\\s*$`, "m");
  return tablePattern.test(contents) && !contents.includes(REGISTRATION_START);
}

function isCi(environment: Readonly<Record<string, string | undefined>>): boolean {
  const value = environment.CI?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/**
 * Registers one MCP command in the trusted project's `.codex/config.toml`.
 *
 * The registrar is opt-in at runtime and never touches `~/.codex`. It skips
 * CI, preserves an existing unmanaged `nudge_ui` table, and turns all file
 * errors into a non-fatal result so package installation or server startup
 * remains usable when the project is read-only.
 */
export function createProjectLocalCodexRegistrar(options: ProjectLocalCodexRegistrarOptions = {}): AgentRegistrar {
  const environment = options.environment ?? process.env;
  const fileSystem = options.fileSystem ?? NODE_FILE_SYSTEM;
  const projectRoot = resolve(options.projectRoot ?? environment.INIT_CWD ?? process.cwd());
  const configDirectoryName = options.configDirectoryName ?? ".codex";
  const configFileName = options.configFileName ?? "config.toml";
  const configPath = join(projectRoot, configDirectoryName, configFileName);
  const configDirectory = join(projectRoot, configDirectoryName);

  return {
    async register(context): Promise<RegistrationResult> {
      if (isCi(environment)) return { registered: false, reason: "automatic registration is disabled in CI" };
      try {
        const existing = await fileSystem.readFile(configPath, "utf8").catch((error: unknown) => {
          const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
          if (code === "ENOENT") return "";
          throw error;
        });
        if (hasUnmanagedNudgeTable(existing)) {
          return { registered: false, reason: "project Codex config already defines nudge_ui" };
        }
        await fileSystem.mkdir(configDirectory, { recursive: true });
        await fileSystem.writeFile(configPath, replaceManagedBlock(existing, registrationBlock(context)), "utf8");
        return { registered: true };
      } catch (error) {
        return {
          registered: false,
          reason: error instanceof Error ? error.message : "project Codex registration failed",
        };
      }
    },
  };
}
