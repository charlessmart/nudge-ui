import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const port = process.env.DT_STANDALONE_PORT ?? "4177";
const temporaryProjectRoot = join(tmpdir(), `design-tool-standalone-e2e-${port}`);

// The test worker uses this path for the agent-style source edit. It points to
// the disposable copy, never to the checked-in consumer fixture.
process.env.DESIGN_TOOL_STANDALONE_E2E_ROOT = temporaryProjectRoot;

const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  globalTeardown: "./scripts/cleanup-fixture.mjs",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    permissions: ["clipboard-read", "clipboard-write"],
    trace: "on-first-retry",
  },
  webServer: {
    command: `node scripts/serve-fixture.mjs --root ${JSON.stringify(temporaryProjectRoot)} --port ${port}`,
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
