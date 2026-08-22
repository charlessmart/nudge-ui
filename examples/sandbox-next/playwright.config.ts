import { defineConfig, devices } from "@playwright/test";

const DEV_PORT = process.env.DT_DEV_PORT ?? "5177";
const DEV_URL = `http://localhost:${DEV_PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: DEV_URL, trace: "on-first-retry" },
  projects: [
    {
      name: "dev",
      use: { ...devices["Desktop Chrome"], baseURL: DEV_URL },
      testMatch: /.*\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: `pnpm dev --port ${DEV_PORT}`,
      url: `${DEV_URL}/second`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      name: "dev",
    },
  ],
});
