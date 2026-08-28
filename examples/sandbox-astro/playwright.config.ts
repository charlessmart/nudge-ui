import { defineConfig, devices } from "@playwright/test";

const DEV_PORT = process.env.NUDGE_UI_DEV_PORT ?? "4322";
const DEV_URL = `http://localhost:${DEV_PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: { trace: "on-first-retry", permissions: ["clipboard-read", "clipboard-write"] },
  projects: [
    {
      name: "dev",
      use: { ...devices["Desktop Chrome"], baseURL: DEV_URL },
      testMatch: /.*\.dev\.spec\.ts/,
    },
  ],
  webServer: {
    command: `pnpm dev --port ${DEV_PORT}`,
    url: `${DEV_URL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    name: "dev",
  },
});
