import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  configureProjectAgents,
  isAgentServerAvailable,
  manualAgentConfiguration,
  planAgentSetup,
} from "./agent-setup.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("project-local agent setup", () => {
  it("pins the matching MCP package and launches its local entry for this workspace", () => {
    const root = project();

    const plan = planAgentSetup(root, "npm");

    expect(plan.packageSpecifier).toBe("@nudge-ui/mcp@0.2.0");
    expect(plan.installCommand).toEqual({
      executable: "npm",
      args: ["install", "--save-dev", "@nudge-ui/mcp@0.2.0"],
    });
    expect(plan.serverConfig).toEqual({
      command: "node",
      args: [
        join(plan.projectRoot, "node_modules", "@nudge-ui", "mcp", "dist", "cli.mjs"),
        "--workspace-root",
        plan.projectRoot,
      ],
    });
    expect(isAgentServerAvailable(plan)).toBe(false);
    mkdirSync(join(plan.projectRoot, "node_modules", "@nudge-ui", "mcp", "dist"), { recursive: true });
    writeFileSync(plan.serverEntry!, "");
    expect(isAgentServerAvailable(plan)).toBe(true);
  });

  it("matches an existing Nudge UI version and supports Yarn Plug'n'Play execution", () => {
    const root = project();
    mkdirSync(join(root, "node_modules", "nudge-ui"), { recursive: true });
    writeFileSync(join(root, "node_modules", "nudge-ui", "package.json"), JSON.stringify({ version: "0.1.9" }));

    const plan = planAgentSetup(root, "yarn");

    expect(plan.packageSpecifier).toBe("@nudge-ui/mcp@0.1.9");
    expect(plan.serverEntry).toBeUndefined();
    expect(plan.serverConfig).toEqual({
      command: "yarn",
      args: ["--cwd", plan.projectRoot, "exec", "nudge-mcp", "--workspace-root", plan.projectRoot],
    });
    expect(isAgentServerAvailable(plan)).toBe(true);
  });

  it("uses the planned Nudge UI upgrade version before the package is installed", () => {
    const root = project();
    mkdirSync(join(root, "node_modules", "nudge-ui"), { recursive: true });
    writeFileSync(join(root, "node_modules", "nudge-ui", "package.json"), JSON.stringify({ version: "0.1.9" }));

    const plan = planAgentSetup(root, "npm", "0.2.0");

    expect(plan.packageSpecifier).toBe("@nudge-ui/mcp@0.2.0");
  });

  it("preserves existing Codex settings and safely repairs the same Nudge entry", () => {
    const root = project();
    const codexDirectory = join(root, ".codex");
    const configPath = join(codexDirectory, "config.toml");
    const plan = planAgentSetup(root, "pnpm");
    mkdirSync(codexDirectory);
    writeFileSync(configPath, `model = "gpt-5"

[mcp_servers.other]
command = "other-server"

[mcp_servers.nudge_ui]
command = "obsolete-server"
`);

    const first = configureProjectAgents(plan, ["codex"]);
    const second = configureProjectAgents(plan, ["codex"]);
    const config = readFileSync(configPath, "utf8");

    expect(first[0]?.result?.success).toBe(true);
    expect(second[0]?.result?.success).toBe(true);
    expect(config.match(/\[mcp_servers\.nudge_ui\]/g)).toHaveLength(1);
    expect(config).toContain('model = "gpt-5"');
    expect(config).toContain("[mcp_servers.other]");
    expect(config).toContain('command = "other-server"');
    expect(config).not.toContain("obsolete-server");
    expect(config).toContain("--workspace-root");
    expect(config).toContain(root);
  });

  it("reports a malformed agent configuration without overwriting it", () => {
    const root = project();
    const codexDirectory = join(root, ".codex");
    const configPath = join(codexDirectory, "config.toml");
    const malformed = "[broken\n";
    mkdirSync(codexDirectory);
    writeFileSync(configPath, malformed);

    const outcome = configureProjectAgents(planAgentSetup(root, "npm"), ["codex"]);

    expect(outcome[0]?.result?.success).toBe(false);
    expect(outcome[0]?.result?.error).toBeTruthy();
    expect(readFileSync(configPath, "utf8")).toBe(malformed);
  });

  it("returns exact manual configuration for an unsupported agent", () => {
    const root = project();
    const plan = planAgentSetup(root, "yarn");

    expect(configureProjectAgents(plan, ["my-agent"])).toEqual([{
      agent: "my-agent",
      displayName: "my-agent",
      unsupported: true,
    }]);
    expect(JSON.parse(manualAgentConfiguration(plan))).toEqual({
      mcpServers: { nudge_ui: plan.serverConfig },
    });
  });
});

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "create-nudge-ui-agent-"));
  temporaryDirectories.push(root);
  writeFileSync(join(root, "package.json"), "{}");
  return root;
}
