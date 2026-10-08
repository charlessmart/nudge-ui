import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseCliArguments } from "./cli.ts";

describe("nudge-mcp CLI", () => {
  it("parses doctor as a diagnostic command scoped to a workspace", () => {
    expect(parseCliArguments(["doctor", "--workspace-root", "/workspace/product-site"], {})).toEqual({
      command: "doctor",
      workspaceRoot: "/workspace/product-site",
      help: false,
    });
  });

  it("does not bind a reusable adapter to the host working directory", () => {
    expect(parseCliArguments([], { INIT_CWD: "/unrelated/checkout" })).toEqual({ command: "serve", help: false });
  });

  it("rejects a removed coupled-mode option with a setup instruction", () => {
    expect(() => parseCliArguments(["--origin", "http://localhost:5173"], {}))
      .toThrow(/--origin .*npx nudge-ui agent setup/);
  });

  it("rejects a startup workspace when serving", () => {
    expect(() => parseCliArguments(["--workspace-root", "/workspace/product-site"], {}))
      .toThrow(/--workspace-root .*npx nudge-ui agent setup/);
  });

  it("rejects legacy environment configuration when serving", () => {
    expect(() => parseCliArguments([], { NUDGE_UI_WORKSPACE_ROOT: "/workspace/product-site" }))
      .toThrow(/NUDGE_UI_WORKSPACE_ROOT .*npx nudge-ui agent setup/);
  });

  it("invokes runCli explicitly from the executable entry instead of relying on module auto-run", async () => {
    const entry = await readFile(fileURLToPath(new URL("./cli-entry.ts", import.meta.url)), "utf8");
    expect(entry).toMatch(/runCli\(\)\.catch/);
  });
});
