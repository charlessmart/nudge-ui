import { rmSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { basename, relative } from "node:path";
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
import { frameworks, type ConfigurationChange, type Framework } from "./types.ts";

/** Runs the Nudge UI project initializer. */
export async function runCli(args = process.argv.slice(2), projectRoot = process.cwd()): Promise<void> {
  const options = parseArguments(args);
  if (options.help) {
    stdout.write(`${helpText}\n`);
    return;
  }

  const manifest = readProjectManifest(projectRoot);
  const detected = detectFrameworks(projectRoot, manifest);
  const framework = options.framework ?? await selectFramework(detected);
  const packageManager = options.packageManager ?? detectPackageManager(projectRoot, manifest);
  // One package serves every host; the framework only decides which
  // subpath the generated configuration imports.
  const command = installCommand(packageManager, "nudge-ui");
  const change = planConfiguration(projectRoot, framework);
  const staticRoot = framework === "standalone" ? detectStaticRoot(projectRoot) : undefined;
  const serveDirectory = staticRoot ? relative(projectRoot, staticRoot) || "." : ".";

  stdout.write(`Nudge UI detected ${frameworkDisplayName(framework)} in ${basename(projectRoot)}.\n`);
  if (options.dryRun) {
    stdout.write(`Would run: ${formatCommand(command)}\n`);
    if (change) stdout.write(`Would ${change.created ? "create" : "update"}: ${change.path}\n`);
    if (framework === "standalone") stdout.write(`After installation, run: nudge-ui serve ${serveDirectory}\n`);
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
