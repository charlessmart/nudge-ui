import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import {
  agents,
  detectGlobalAgents,
  detectProjectAgents,
  getAgentTypes,
  upsertServer,
  type AgentType,
  type InstallResult,
  type McpServerConfig,
} from "add-mcp";
import { installCommand, type InstallCommand } from "./installer.ts";
import type { PackageManager } from "./types.ts";

export const nudgeServerName = "nudge_ui";

export interface AgentSetupPlan {
  readonly projectRoot: string;
  readonly packageSpecifier: string;
  readonly installCommand: InstallCommand;
  readonly serverConfig: McpServerConfig;
  readonly serverEntry?: string;
}

export interface AgentInstallOutcome {
  readonly agent: string;
  readonly displayName: string;
  readonly result?: InstallResult;
  readonly unsupported: boolean;
}

/** Builds the reproducible, project-local MCP installation and launch plan. */
export function planAgentSetup(
  projectRoot: string,
  packageManager: PackageManager,
  nudgeUiVersion?: string,
): AgentSetupPlan {
  const canonicalRoot = realpathSync.native(projectRoot);
  const packageSpecifier = `@nudge-ui/mcp@${
    nudgeUiVersion ?? installedNudgeUiVersion(canonicalRoot) ?? initializerVersion()
  }`;
  const serverEntry = join(canonicalRoot, "node_modules", "@nudge-ui", "mcp", "dist", "cli.mjs");
  const usesPlugAndPlay = packageManager === "yarn";
  const serverConfig: McpServerConfig = usesPlugAndPlay
    ? {
        command: "yarn",
        args: ["--cwd", canonicalRoot, "exec", "nudge-mcp", "--workspace-root", canonicalRoot],
      }
    : {
        command: "node",
        args: [serverEntry, "--workspace-root", canonicalRoot],
      };
  return {
    projectRoot: canonicalRoot,
    packageSpecifier,
    installCommand: installCommand(packageManager, packageSpecifier),
    serverConfig,
    serverEntry: usesPlugAndPlay ? undefined : serverEntry,
  };
}

/** Checks that a node_modules based install produced the configured executable. */
export function isAgentServerAvailable(plan: AgentSetupPlan): boolean {
  return plan.serverEntry === undefined || existsSync(plan.serverEntry);
}

/** Returns agents that can store an MCP configuration in this project. */
export function projectAgentTypes(): AgentType[] {
  return getAgentTypes().filter((agent) => agents[agent].localConfigPath !== undefined);
}

/** Detects installed or already configured agents while preserving project scope. */
export async function detectProjectAgentCandidates(projectRoot: string): Promise<AgentType[]> {
  const supported = new Set(projectAgentTypes());
  const detected = [
    ...detectProjectAgents(projectRoot),
    ...await detectGlobalAgents(),
  ].filter((agent) => supported.has(agent));
  return [...new Set(detected)];
}

/** Adds or repairs Nudge's project-scoped MCP entry without replacing other servers. */
export function configureProjectAgents(
  plan: AgentSetupPlan,
  selectedAgents: readonly string[],
): AgentInstallOutcome[] {
  const supported = new Set(projectAgentTypes());
  return [...new Set(selectedAgents)].map((agent) => {
    if (!supported.has(agent as AgentType)) {
      return { agent, displayName: agent, unsupported: true };
    }
    const agentType = agent as AgentType;
    const result = upsertServer(agentType, nudgeServerName, plan.serverConfig, {
      cwd: plan.projectRoot,
      local: true,
    });
    return {
      agent,
      displayName: agents[agentType].displayName,
      result,
      unsupported: false,
    };
  });
}

/** Formats a complete stdio entry for agents that add-mcp cannot configure. */
export function manualAgentConfiguration(plan: AgentSetupPlan): string {
  return JSON.stringify({
    mcpServers: {
      [nudgeServerName]: plan.serverConfig,
    },
  }, null, 2);
}

export function projectAgentChoices(detected: readonly AgentType[]): Array<{
  readonly id: AgentType;
  readonly label: string;
  readonly detected: boolean;
}> {
  const detectedSet = new Set(detected);
  return projectAgentTypes()
    .sort((left, right) => {
      const detectionOrder = Number(detectedSet.has(right)) - Number(detectedSet.has(left));
      return detectionOrder || agents[left].displayName.localeCompare(agents[right].displayName);
    })
    .map((id) => ({ id, label: agents[id].displayName, detected: detectedSet.has(id) }));
}

export function initializerVersion(): string {
  const packageJsonUrl = new URL("../package.json", import.meta.url);
  const value: unknown = JSON.parse(readFileSync(packageJsonUrl, "utf8"));
  if (!isPackageMetadata(value)) throw new TypeError("create-nudge-ui package metadata has no version.");
  return value.version;
}

function installedNudgeUiVersion(projectRoot: string): string | undefined {
  const manifestPath = join(projectRoot, "node_modules", "nudge-ui", "package.json");
  try {
    const value: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    return isPackageMetadata(value) ? value.version : undefined;
  } catch {
    return undefined;
  }
}

function isPackageMetadata(value: unknown): value is { readonly version: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return typeof (value as { readonly version?: unknown }).version === "string";
}
