import { defineConfig, devices } from "@playwright/test";

const DEV_PORT = process.env.NUDGE_UI_DEV_PORT ?? "5177";
const DEV_URL = `http://localhost:${DEV_PORT}`;
const PROD_PORT = process.env.NUDGE_UI_PROD_PORT ?? "5180";
const PROD_URL = `http://localhost:${PROD_PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: { trace: "on-first-retry" },
  projects: [
    {
      name: "dev",
      use: { ...devices["Desktop Chrome"], baseURL: DEV_URL },
      testMatch: /.*\.dev\.spec\.ts/,
    },
    {
      name: "prod",
      use: { ...devices["Desktop Chrome"], baseURL: PROD_URL },
      testMatch: /.*\.prod\.spec\.ts/,
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
    {
      // ADR-0002 production proof: the wrapper must be a complete no-op
      // under next build / next start.
      command: `NODE_ENV=production pnpm build && pnpm start --port ${PROD_PORT}`,
      url: PROD_URL,
      reuseExistingServer: false,
      timeout: 300_000,
      name: "prod",
      env: { NODE_ENV: "production" },
    },
  ],
});
