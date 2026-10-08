import { spawnSync } from "node:child_process";
import { findProjectMcpRoot, projectMcpCliEntry } from "../project/mcpPackage.ts";

export interface AgentCommand {
  readonly executable: string;
  readonly args: readonly string[];
}

/** Resolves agent setup and diagnostics without depending on MCP at runtime. */
export function planAgentCommand(
  args: readonly string[],
  projectRoot: string,
  packageVersion?: string,
): AgentCommand {
  if (args[0] === "setup") {
    if (!packageVersion || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(packageVersion)) {
      throw new Error("Run agent setup through the installed nudge-ui executable.");
    }
    return {
      executable: process.platform === "win32" ? "npx.cmd" : "npx",
      args: ["--yes", `create-nudge-ui@${packageVersion}`, "--agent-only", ...args.slice(1)],
    };
  }
  if (args[0] === "doctor") {
    const mcpRoot = findProjectMcpRoot(projectRoot);
    const entry = mcpRoot === null ? null : projectMcpCliEntry(mcpRoot);
    if (entry === null) throw new Error("Nudge agent integration is not installed. Run nudge-ui agent setup.");
    return {
      executable: process.execPath,
      args: [entry, "doctor", "--workspace-root", projectRoot, ...args.slice(1)],
    };
  }
  throw new Error("Usage: nudge-ui agent <setup|doctor> [options]");
}

/** Runs an agent command with the application's working directory and terminal. */
export function runAgentCommand(args: readonly string[], packageVersion?: string): void {
  const command = planAgentCommand(args, process.cwd(), packageVersion);
  const result = spawnSync(command.executable, command.args, { cwd: process.cwd(), stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Nudge agent command exited with status ${result.status ?? "unknown"}.`);
  }
}
