import { describe, expect, it } from "vitest";
import {
  createProjectLocalCodexRegistrar,
  type RegistrarFileSystem,
} from "./registrar.ts";

function memoryFileSystem(initial = ""): RegistrarFileSystem & { written: string | null } {
  return {
    written: null,
    async mkdir() {},
    async readFile() {
      if (!initial) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return initial;
    },
    async writeFile(_path, data) { this.written = data; },
  };
}

const context = {
  project: { projectId: "sandbox", workspaceRoot: "/workspace/sandbox" },
  bridge: { host: "127.0.0.1", port: 49_001, url: "http://127.0.0.1:49001" },
  instructions: "Listen for requests",
} as const;

describe("project-local Codex registrar", () => {
  it("preserves unrelated settings and writes one marked, long-lived MCP entry", async () => {
    const fileSystem = memoryFileSystem('model = "gpt-5"\n');
    const registrar = createProjectLocalCodexRegistrar({
      projectRoot: "/workspace/sandbox",
      environment: {},
      fileSystem,
    });

    await expect(registrar.register(context)).resolves.toEqual({ registered: true });
    expect(fileSystem.written).toContain('model = "gpt-5"');
    expect(fileSystem.written).toContain("# BEGIN NUDGE UI MCP (managed)");
    expect(fileSystem.written).toContain('"--project-id", "sandbox"');
    expect(fileSystem.written).toContain('"--workspace-root", "/workspace/sandbox"');
    expect(fileSystem.written).toContain("tool_timeout_sec = 86400");
    expect(fileSystem.written).not.toContain("cwd =");
  });

  it("does not modify project configuration in CI", async () => {
    const fileSystem = memoryFileSystem();
    const registrar = createProjectLocalCodexRegistrar({
      projectRoot: "/workspace/sandbox",
      environment: { CI: "true" },
      fileSystem,
    });

    await expect(registrar.register(context)).resolves.toMatchObject({ registered: false, reason: expect.stringContaining("CI") });
    expect(fileSystem.written).toBeNull();
  });

  it("leaves a user-owned nudge_ui table untouched", async () => {
    const existing = '[mcp_servers.nudge_ui]\ncommand = "custom"\n';
    const fileSystem = memoryFileSystem(existing);
    const registrar = createProjectLocalCodexRegistrar({
      projectRoot: "/workspace/sandbox",
      environment: {},
      fileSystem,
    });

    await expect(registrar.register(context)).resolves.toMatchObject({ registered: false });
    expect(fileSystem.written).toBeNull();
  });
});
