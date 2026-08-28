#!/usr/bin/env node

/*
 * Keep installation registration deliberately small and failure-tolerant.
 * All `.codex/config.toml` mutation (managed-block markers, TOML quoting,
 * block replacement, unmanaged-table detection, CI skipping) lives in the
 * registrar bundled to `dist/registrar.mjs`; this wrapper only decides
 * whether to run it and never fails installation.
 */
import { basename, resolve } from "node:path";

const environment = process.env;
const ciValue = (environment.CI ?? "").trim().toLowerCase();
if (ciValue === "1" || ciValue === "true" || ciValue === "yes") process.exit(0);

// The registrar defaults to INIT_CWD ?? process.cwd(); keep the cheap early
// exit so a dev checkout without INIT_CWD does no work at all.
if (!environment.INIT_CWD) process.exit(0);

let createProjectLocalCodexRegistrar;
try {
  ({ createProjectLocalCodexRegistrar } = await import("../dist/registrar.mjs"));
} catch (error) {
  // dist is absent in a dev checkout that has not been built. Installation
  // must never fail because of optional registration.
  const message = error instanceof Error ? error.message : "unknown registrar import error";
  console.error(`[nudge-ui] project MCP registration skipped: ${message}`);
  process.exit(0);
}

const registrar = createProjectLocalCodexRegistrar({ environment });
const root = resolve(environment.INIT_CWD);
// Only `project` is consumed by the registration block; the bridge and
// instruction fields exist for the shared registrar port and are unused here.
await registrar.register({
  project: { projectId: basename(root) || "project", workspaceRoot: root },
  bridge: { host: "127.0.0.1", port: 0, url: "" },
  instructions: "",
});
// `{ registered: false }` (CI guard, existing unmanaged table, or a file
// error surfaced as a reason) is still a successful install.
process.exit(0);
