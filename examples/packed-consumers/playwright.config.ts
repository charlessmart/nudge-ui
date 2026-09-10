import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  timeout: 45_000,
  use: {
    ...devices["Desktop Chrome"],
    trace: "on-first-retry",
  },
});
