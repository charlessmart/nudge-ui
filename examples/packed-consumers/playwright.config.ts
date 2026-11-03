import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: `./test-results/${process.env.NUDGE_UI_PACKED_ADAPTER ?? "unknown-adapter"}`,
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  timeout: 45_000,
  use: {
    ...devices["Desktop Chrome"],
    channel: "chrome",
    launchOptions: { chromiumSandbox: true },
    trace: "retain-on-failure",
  },
});
