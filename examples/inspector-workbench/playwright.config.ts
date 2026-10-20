import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1100 }, baseURL: "http://localhost:5186", trace: "retain-on-failure" },
  webServer: { command: "pnpm dev", url: "http://localhost:5186", reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
