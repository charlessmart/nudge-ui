import { rmSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { basename, relative } from "node:path";
import {
  configureProjectAgents,
  detectProjectAgentCandidates,
  initializerVersion,
  isAgentServerAvailable,
  manualAgentConfiguration,
  planAgentSetup,
  projectAgentChoices,
  type AgentSetupPlan,
} from "./agent-setup.ts";
import { parseArguments, helpText } from "./arguments.ts";
import { planConfiguration } from "./configuration.ts";
import {
  detectFrameworks,
  detectPackageManager,
  detectStaticRoot,
  frameworkDisplayName,
  readProjectManifest,
} from "./detection.ts";
import { formatCommand, installCommand, installPackage } from "./installer.ts";
import {
  frameworks,
  type ConfigurationChange,
  type Framework,
  type PackageManager,
} from "./types.ts";

export interface RunAgentSetupOptions {
  readonly agents?: readonly string[];
  readonly dryRun?: boolean;
  readonly nudgeUiVersion?: string;
  readonly packageManager?: PackageManager;
  readonly yes?: boolean;
}

/** Runs the Nudge UI project initializer. */
export async function runCli(args = process.argv.slice(2), projectRoot = process.cwd()): Promise<void> {
  const options = parseArguments(args);
  if (options.help) {
    stdout.write(`${helpText}\n`);
    return;
  }

  const manifest = readProjectManifest(projectRoot);
  const packageManager = options.packageManager ?? detectPackageManager(projectRoot, manifest);
  if (options.agentOnly) {
    await runAgentSetup(projectRoot, {
      agents: options.agents,
      dryRun: options.dryRun,
      packageManager,
      yes: options.yes,
    });
    return;
  }

  const detected = detectFrameworks(projectRoot, manifest);
  const framework = options.framework ?? await selectFramework(detected);
  // One package serves every host; the framework only decides which
  // subpath the generated configuration imports.
  const command = installCommand(packageManager, `nudge-ui@${initializerVersion()}`);
  const change = planConfiguration(projectRoot, framework);
  const staticRoot = framework === "standalone" ? detectStaticRoot(projectRoot) : undefined;
  const serveDirectory = staticRoot ? relative(projectRoot, staticRoot) || "." : ".";

  stdout.write(`Nudge UI detected ${frameworkDisplayName(framework)} in ${basename(projectRoot)}.\n`);
  if (options.dryRun) {
    stdout.write(`Would run: ${formatCommand(command)}\n`);
    if (change) stdout.write(`Would ${change.created ? "create" : "update"}: ${change.path}\n`);
    if (framework === "standalone") stdout.write(`After installation, run: nudge-ui serve ${serveDirectory}\n`);
    if (await shouldConfigureAgent(options.mcp, options.agents.length > 0, options.yes)) {
      await runAgentSetup(projectRoot, {
        agents: options.agents,
        dryRun: true,
        nudgeUiVersion: initializerVersion(),
        packageManager,
        yes: options.yes,
      });
    }
    return;
  }

  if (change) {
    writeFileSync(change.path, change.content);
  }
  try {
    installPackage(command, projectRoot);
  } catch (error) {
    if (change) rollbackConfiguration(change);
    throw error;
  }
  if (change) {
    stdout.write(`${change.created ? "Created" : "Updated"} ${change.path}.\n`);
  }
  if (framework === "standalone") {
    stdout.write(`Run \`nudge-ui serve ${serveDirectory}\` to start the instrumented development server.\n`);
  }
  stdout.write(`Nudge UI is configured for ${frameworkDisplayName(framework)}.\n`);
  if (await shouldConfigureAgent(options.mcp, options.agents.length > 0, options.yes)) {
    await runAgentSetup(projectRoot, {
      agents: options.agents,
      nudgeUiVersion: initializerVersion(),
      packageManager,
      yes: options.yes,
    });
  }
}

/** Installs and configures the project-local MCP companion. Safe to rerun for repairs. */
export async function runAgentSetup(
  projectRoot = process.cwd(),
  options: RunAgentSetupOptions = {},
): Promise<void> {
  const manifest = readProjectManifest(projectRoot);
  const packageManager = options.packageManager ?? detectPackageManager(projectRoot, manifest);
  const plan = planAgentSetup(projectRoot, packageManager, options.nudgeUiVersion);
  const detected = await detectProjectAgentCandidates(plan.projectRoot);
  const selected = options.agents && options.agents.length > 0
    ? options.agents
    : options.yes || !stdin.isTTY || !stdout.isTTY
      ? detected
      : await selectAgents(detected);

  if (options.dryRun) {
    stdout.write(`Would run: ${formatCommand(plan.installCommand)}\n`);
    if (selected.length > 0) {
      stdout.write(`Would configure project MCP for: ${selected.join(", ")}\n`);
    } else {
      stdout.write("No coding agent was detected. Use --agent <id> or add the configuration below manually.\n");
      writeManualInstructions(plan);
    }
    return;
  }

  installPackage(plan.installCommand, plan.projectRoot);
  if (!isAgentServerAvailable(plan)) {
    stdout.write(`Installed ${plan.packageSpecifier}, but its local MCP executable was not found at ${plan.serverEntry}.\n`);
    stdout.write("The coding-agent configuration was not changed. Check the package-manager install output, then rerun with --agent-only.\n");
    return;
  }
  if (selected.length === 0) {
    stdout.write(`Installed ${plan.packageSpecifier}, but no coding agent was detected.\n`);
    writeManualInstructions(plan);
    return;
  }

  let outcomes;
  try {
    outcomes = configureProjectAgents(plan, selected);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stdout.write(`Could not update the coding-agent configuration: ${message}\n`);
    writeManualInstructions(plan);
    return;
  }

  let configured = 0;
  for (const outcome of outcomes) {
    if (outcome.unsupported) {
      stdout.write(`${outcome.displayName} is not supported for automatic project setup.\n`);
      continue;
    }
    if (outcome.result?.success) {
      configured += 1;
      stdout.write(`Configured ${outcome.displayName}: ${outcome.result.path}\n`);
      continue;
    }
    stdout.write(`Could not configure ${outcome.displayName}: ${outcome.result?.error ?? "unknown error"}\n`);
  }
  if (configured !== outcomes.length) writeManualInstructions(plan);
  if (configured > 0) {
    stdout.write("Coding-agent setup is ready. Reload the agent if it is already open, then ask it to listen to Nudge.\n");
  }
}

async function shouldConfigureAgent(
  preference: boolean | undefined,
  hasExplicitAgents: boolean,
  yes: boolean,
): Promise<boolean> {
  if (preference !== undefined) return preference;
  if (hasExplicitAgents || yes) return true;
  if (!stdin.isTTY || !stdout.isTTY) return false;
  return promptYesNo("Connect a coding agent?", true);
}

async function promptYesNo(message: string, defaultValue: boolean): Promise<boolean> {
  const reader = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await reader.question(`${message} ${defaultValue ? "[Y/n]" : "[y/N]"} `)).trim().toLowerCase();
    if (!answer) return defaultValue;
    return answer === "y" || answer === "yes";
  } finally {
    reader.close();
  }
}

async function selectAgents(detected: Awaited<ReturnType<typeof detectProjectAgentCandidates>>): Promise<string[]> {
  const choices = projectAgentChoices(detected);
  stdout.write("Select coding agents (comma-separated):\n");
  choices.forEach((choice, index) => {
    stdout.write(`  ${index + 1}. ${choice.label}${choice.detected ? " (detected)" : ""}\n`);
  });
  const defaults = choices
    .map((choice, index) => choice.detected ? String(index + 1) : undefined)
    .filter((value): value is string => value !== undefined)
    .join(",");
  const reader = createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const suffix = defaults ? ` [${defaults}]` : "";
      const answer = (await reader.question(`Agents${suffix}: `)).trim() || defaults;
      const indexes = answer.split(",").map((value) => Number(value.trim()) - 1);
      if (indexes.length > 0 && indexes.every((index) => choices[index])) {
        return [...new Set(indexes.map((index) => choices[index]!.id))];
      }
      stdout.write(`Enter one or more numbers from 1 to ${choices.length}.\n`);
    }
  } finally {
    reader.close();
  }
}

function writeManualInstructions(plan: AgentSetupPlan): void {
  stdout.write("Add this project-scoped stdio server to your agent's MCP settings:\n");
  stdout.write(`${manualAgentConfiguration(plan)}\n`);
}

async function selectFramework(detected: readonly Framework[]): Promise<Framework> {
  if (detected.length === 1) return detected[0]!;
  if (!stdin.isTTY || !stdout.isTTY) throw detectionError(detected);

  const choices = detected.length > 1 ? detected : frameworks;
  stdout.write("Select the host framework:\n");
  choices.forEach((framework, index) => stdout.write(`  ${index + 1}. ${frameworkDisplayName(framework)}\n`));
  const reader = createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = await reader.question("Framework: ");
      const selected = choices[Number(answer) - 1];
      if (selected) return selected;
      stdout.write(`Enter a number from 1 to ${choices.length}.\n`);
    }
  } finally {
    reader.close();
  }
}

function rollbackConfiguration(change: ConfigurationChange): void {
  if (change.created) {
    rmSync(change.path, { force: true });
    return;
  }
  if (change.originalContent === undefined) {
    throw new Error(`Could not restore ${change.path}: original content was not recorded.`);
  }
  writeFileSync(change.path, change.originalContent);
}

function detectionError(detected: readonly Framework[]): Error {
  if (detected.length > 1) {
    return new Error(`Detected multiple host frameworks (${detected.join(", ")}). Pass --framework explicitly.`);
  }
  return new Error("Could not detect a supported host framework. Pass --framework explicitly.");
}
