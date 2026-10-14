import { spawnSync } from "node:child_process";
import type { PackageManager } from "./types.ts";

export interface InstallCommand {
  readonly executable: string;
  readonly args: readonly string[];
}

export function installCommand(packageManager: PackageManager, packageName: string): InstallCommand {
  if (packageManager === "pnpm") return { executable: "pnpm", args: ["add", "-D", packageName] };
  if (packageManager === "yarn") return { executable: "yarn", args: ["add", "-D", packageName] };
  if (packageManager === "bun") return { executable: "bun", args: ["add", "--dev", packageName] };
  return { executable: "npm", args: ["install", "--save-dev", packageName] };
}

export function installPackage(command: InstallCommand, projectRoot: string): void {
  const executable = process.platform === "win32" ? `${command.executable}.cmd` : command.executable;
  const result = spawnSync(executable, command.args, { cwd: projectRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command.executable} exited with status ${result.status ?? "unknown"}.`);
  }
}

export function formatCommand(command: InstallCommand): string {
  return [command.executable, ...command.args].join(" ");
}
