import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agents } from "add-mcp";
import { afterEach, describe, expect, it } from "vitest";
import { configureProjectAgents, manualAgentConfiguration, planAgentSetup } from "./agent-setup.ts";

const temporaryDirectories: string[] = [];
const originalCodexPath = agents.codex.configPath;
const originalOpenCodeResolver = agents.opencode.resolveConfigPath;
const originalOpenCodeDetect = agents.opencode.detectGlobalInstall;
afterEach(() => {
  agents.codex.configPath = originalCodexPath;
  agents.opencode.resolveConfigPath = originalOpenCodeResolver;
  agents.opencode.detectGlobalInstall = originalOpenCodeDetect;
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "nudge-agent-setup-"));
  temporaryDirectories.push(root);
  const projectRoot = join(root, "project");
  mkdirSync(join(projectRoot, ".codex"), { recursive: true });
  writeFileSync(join(projectRoot, "package.json"), "{}");
  agents.codex.configPath = join(root, "global.toml");
  return { projectRoot, globalPath: agents.codex.configPath, localPath: join(projectRoot, ".codex", "config.toml"), adapterDirectory: join(root, "adapters") };
}

describe("reusable agent setup", () => {
  it("uses the same independent executable for different projects and package managers", () => {
    const first = fixture();
    const second = fixture();
    const a = planAgentSetup(first.projectRoot, "npm", "0.1.9", first.adapterDirectory);
    const b = planAgentSetup(second.projectRoot, "yarn", "0.2.1", first.adapterDirectory);
    expect(a.serverConfig).toEqual(b.serverConfig);
    expect(JSON.stringify(a.serverConfig)).not.toContain(first.projectRoot);
    expect(JSON.stringify(a.serverConfig)).not.toContain(second.projectRoot);
    expect(JSON.stringify(a.serverConfig)).not.toContain("--workspace-root");
    expect(a.packageSpecifier).toBe("@nudge-ui/mcp@0.1.9");
    expect(a.adapterInstallCommand.args).toContain("@nudge-ui/mcp@0.2.1");
  });

  it("uses a local MCP tarball for both the project bridge and reusable adapter", () => {
    const paths = fixture();
    const tarball = join(paths.projectRoot, "..", "@nudge-ui-mcp-local.tgz");
    const plan = planAgentSetup(paths.projectRoot, "npm", undefined, paths.adapterDirectory, tarball);

    expect(plan.packageSpecifier).toBe(tarball);
    expect(plan.installCommand.args).toContain(tarball);
    expect(plan.adapterInstallCommand.args).toContain(tarball);
  });

  it("backs up and migrates both scopes while preserving unrelated settings", async () => {
    const paths = fixture();
    const global = 'model = "example-model"\n[mcp_servers.other]\ncommand = "other-server"\n[mcp_servers.nudge_ui]\ncommand = "node"\nargs = ["/old-repo/server.js"]\ncwd = "/old-repo"\n';
    const local = '[mcp_servers.nudge_ui]\ncommand = "old-local"\n[mcp_servers.local_other]\ncommand = "keep-me"\n';
    writeFileSync(paths.globalPath, global);
    writeFileSync(paths.localPath, local);
    const plan = planAgentSetup(paths.projectRoot, "pnpm", undefined, paths.adapterDirectory);

    const [outcome] = await configureProjectAgents(plan, ["codex"]);

    expect(outcome?.result?.success).toBe(true);
    expect(outcome?.migrationError).toBeUndefined();
    expect(outcome?.backups?.map((path) => readFileSync(path, "utf8"))).toEqual([global, local]);
    const configured = readFileSync(paths.globalPath, "utf8");
    expect(configured).toContain("other-server");
    expect(configured).toContain("example-model");
    expect(configured).toContain(plan.serverEntry);
    expect(configured).not.toContain("old-repo");
    const projectConfig = readFileSync(paths.localPath, "utf8");
    expect(projectConfig).toContain("keep-me");
    expect(projectConfig).not.toContain("nudge_ui");

    await configureProjectAgents(plan, ["codex"]);
    expect(readFileSync(paths.globalPath, "utf8").match(/\[mcp_servers\.nudge_ui\]/g)).toHaveLength(1);
  });

  it("leaves both configurations unchanged when the local override is malformed", async () => {
    const paths = fixture();
    const global = '[mcp_servers.nudge_ui]\ncommand = "old"\n';
    writeFileSync(paths.globalPath, global);
    writeFileSync(paths.localPath, "[broken\n");
    const [outcome] = await configureProjectAgents(planAgentSetup(paths.projectRoot, "npm"), ["codex"]);
    expect(outcome?.result?.success).toBe(false);
    expect(readFileSync(paths.globalPath, "utf8")).toBe(global);
    expect(readFileSync(paths.localPath, "utf8")).toBe("[broken\n");
  });

  it("keeps OpenCode V2 mcp.servers entries while migrating a legacy project override", async () => {
    const paths = fixture();
    const global = join(paths.projectRoot, "global-opencode.json");
    const local = join(paths.projectRoot, "opencode.json");
    agents.opencode.resolveConfigPath = (_agent, options) => options.local ? local : global;
    agents.opencode.detectGlobalInstall = async () => true;
    writeFileSync(global, JSON.stringify({ mcp: { servers: { other: { type: "local", command: ["other"] } } } }));
    writeFileSync(local, JSON.stringify({ mcp: {
      nudge_ui: { type: "local", command: ["old-local"] },
      local_other: { type: "local", command: ["keep-me"] },
    } }));

    const [outcome] = await configureProjectAgents(planAgentSetup(paths.projectRoot, "npm"), ["opencode"]);

    expect(outcome?.result?.success).toBe(true);
    const configured = JSON.parse(readFileSync(global, "utf8")) as {
      mcp: { servers: Record<string, { type: string; command: string[] }> };
    };
    expect(configured.mcp.servers.other).toEqual({ type: "local", command: ["other"] });
    expect(configured.mcp.servers.nudge_ui).toEqual(expect.objectContaining({
      type: "local",
      command: [process.execPath, expect.stringContaining("cli.mjs")],
    }));
    const migrated = JSON.parse(readFileSync(local, "utf8")) as { mcp: Record<string, unknown> };
    expect(migrated.mcp.nudge_ui).toBeUndefined();
    expect(migrated.mcp.local_other).toEqual({ type: "local", command: ["keep-me"] });
  });

  it("updates an existing OpenCode legacy entry without moving it to mcp.servers", async () => {
    const paths = fixture();
    const global = join(paths.projectRoot, "global-opencode.json");
    const local = join(paths.projectRoot, "missing-opencode.json");
    agents.opencode.resolveConfigPath = (_agent, options) => options.local ? local : global;
    agents.opencode.detectGlobalInstall = async () => true;
    writeFileSync(global, JSON.stringify({ mcp: {
      nudge_ui: { type: "local", command: ["old"] },
      other: { type: "local", command: ["other"] },
    } }));

    const [outcome] = await configureProjectAgents(planAgentSetup(paths.projectRoot, "npm"), ["opencode"]);

    expect(outcome?.result?.success).toBe(true);
    const configured = JSON.parse(readFileSync(global, "utf8")) as { mcp: Record<string, unknown> };
    expect(configured.mcp.nudge_ui).toEqual(expect.objectContaining({ type: "local" }));
    expect(configured.mcp.servers).toBeUndefined();
    expect(configured.mcp.other).toEqual({ type: "local", command: ["other"] });
  });

  it("returns reusable manual configuration for an unsupported host", async () => {
    const paths = fixture();
    const plan = planAgentSetup(paths.projectRoot, "yarn");
    expect(await configureProjectAgents(plan, ["my-agent"])).toEqual([{ agent: "my-agent", displayName: "my-agent", unsupported: true }]);
    expect(JSON.parse(manualAgentConfiguration(plan))).toEqual({ mcpServers: { nudge_ui: plan.serverConfig } });
  });
});
