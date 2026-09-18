import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { planAgentCommand } from "./agentCommand.ts";

const directories: string[] = [];

function project(): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "nudge-agent-command-")));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("agent commands", () => {
  it("runs setup with the installed UI version and preserves argument boundaries", () => {
    const command = planAgentCommand(["setup", "--agent", "cursor", "--dry-run"], project(), "0.3.0-beta.2+sha.123");
    expect(command.args).toEqual([
      "--yes", "create-nudge-ui@0.3.0-beta.2+sha.123", "--agent-only", "--agent", "cursor", "--dry-run",
    ]);
  });

  it("runs diagnostics against the locally installed MCP package for this application", () => {
    const root = project();
    const packageRoot = join(root, "node_modules", "@nudge-ui", "mcp");
    writeFileSync(join(root, "package.json"), JSON.stringify({
      devDependencies: { "@nudge-ui/mcp": "0.2.0" },
    }));
    mkdirSync(join(packageRoot, "dist"), { recursive: true });
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "@nudge-ui/mcp", main: "dist/index.js" }));
    writeFileSync(join(packageRoot, "dist", "index.js"), "");
    const command = planAgentCommand(["doctor"], root);
    expect(command.executable).toBe(process.execPath);
    expect(command.args).toEqual([join(packageRoot, "dist", "cli.mjs"), "doctor", "--workspace-root", root]);
  });

  it("explains how to recover when MCP is not installed", () => {
    const root = project();
    writeFileSync(join(root, "package.json"), JSON.stringify({
      devDependencies: { "@nudge-ui/mcp": "0.2.0" },
    }));
    expect(() => planAgentCommand(["doctor"], root)).toThrow("nudge-ui agent setup");
  });

  it("rejects an unknown action before running a command", () => {
    expect(() => planAgentCommand(["remove"], project(), "0.2.0")).toThrow("Usage:");
  });
});
