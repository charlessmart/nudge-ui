import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  agents,
  detectGlobalAgents,
  detectProjectAgents,
  getAgentTypes,
  upsertServer,
  listInstalledServers,
  removeServer,
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
  readonly adapterRoot: string;
  readonly adapterInstallCommand: InstallCommand;
  readonly serverConfig: McpServerConfig;
  readonly serverEntry: string;
}

export interface AgentInstallOutcome {
  readonly agent: string;
  readonly displayName: string;
  readonly result?: InstallResult;
  readonly unsupported: boolean;
  readonly migrationError?: string;
  readonly backups?: readonly string[];
}

/** Plans the project bridge dependency and an independent, versioned adapter installation. */
export function planAgentSetup(
  projectRoot: string,
  packageManager: PackageManager,
  nudgeUiVersion?: string,
  adapterDirectory = join(homedir(), ".nudge-ui", "adapters"),
  mcpPackageSpecifier?: string,
): AgentSetupPlan {
  const canonicalRoot = realpathSync.native(projectRoot);
  const packageSpecifier = mcpPackageSpecifier ?? `@nudge-ui/mcp@${
    nudgeUiVersion ?? installedNudgeUiVersion(canonicalRoot) ?? initializerVersion()
  }`;
  const adapterPackageSpecifier = mcpPackageSpecifier ?? `@nudge-ui/mcp@${initializerVersion()}`;
  const adapterRoot = join(adapterDirectory, initializerVersion());
  const serverEntry = join(adapterRoot, "node_modules", "@nudge-ui", "mcp", "dist", "cli.mjs");
  const serverConfig: McpServerConfig = { command: process.execPath, args: [serverEntry] };
  return {
    projectRoot: canonicalRoot,
    packageSpecifier,
    installCommand: installCommand(packageManager, packageSpecifier),
    serverConfig,
    adapterRoot,
    adapterInstallCommand: {
      executable: "npm",
      args: ["install", "--prefix", adapterRoot, "--no-save", "--package-lock=false", adapterPackageSpecifier],
    },
    serverEntry,
  };
}

/** Checks that a node_modules based install produced the configured executable. */
export function isAgentServerAvailable(plan: AgentSetupPlan): boolean {
  return existsSync(plan.serverEntry);
}

/** Returns agents that support a reusable stdio MCP configuration. */
export function projectAgentTypes(): AgentType[] {
  return getAgentTypes().filter((agent) => agents[agent].supportedTransports.includes("stdio"));
}

/** Detects installed or already configured agents. */
export async function detectProjectAgentCandidates(projectRoot: string): Promise<AgentType[]> {
  const supported = new Set(projectAgentTypes());
  const detected = [
    ...detectProjectAgents(projectRoot),
    ...await detectGlobalAgents(),
  ].filter((agent) => supported.has(agent));
  return [...new Set(detected)];
}

/** Registers the reusable adapter and removes the current project's overriding entry. */
export async function configureProjectAgents(
  plan: AgentSetupPlan,
  selectedAgents: readonly string[],
): Promise<AgentInstallOutcome[]> {
  const supported = new Set(projectAgentTypes());
  const outcomes: AgentInstallOutcome[] = [];
  for (const agent of new Set(selectedAgents)) {
    if (!supported.has(agent as AgentType)) {
      outcomes.push({ agent, displayName: agent, unsupported: true });
      continue;
    }
    const agentType = agent as AgentType;
    const global = await listInstalledServers({ agents: [agentType], global: true, cwd: plan.projectRoot });
    const local = agents[agentType].localConfigPath
      ? await listInstalledServers({ agents: [agentType], global: false, cwd: plan.projectRoot })
      : [];
    const configurations = [...global, ...local];
    const invalid = configurations.find((configuration) => configuration.error);
    if (invalid) {
      outcomes.push({ agent, displayName: agents[agentType].displayName, unsupported: false,
        result: { success: false, path: invalid.configPath, error: invalid.error } });
      continue;
    }
    const backups: string[] = [];
    for (const configuration of configurations) {
      if (!configuration.servers.some((server) => server.serverName === nudgeServerName)) continue;
      const backup = `${configuration.configPath}.nudge-backup-${randomUUID()}`;
      copyFileSync(configuration.configPath, backup);
      backups.push(backup);
    }
    const result = upsertServer(agentType, nudgeServerName, plan.serverConfig, { local: false, cwd: plan.projectRoot });
    const removal = result.success && agents[agentType].localConfigPath
      ? removeServer(agentType, nudgeServerName, { local: true, cwd: plan.projectRoot })
      : undefined;
    outcomes.push({
      agent, displayName: agents[agentType].displayName, result, unsupported: false, backups,
      ...(removal && !removal.success ? { migrationError: removal.error ?? "Could not remove the project override." } : {}),
    });
  }
  return outcomes;
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
