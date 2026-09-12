import { defineConfig, devices } from "@playwright/test";

const DEV_PORT = process.env.NUDGE_UI_DEV_PORT ?? "5173";
const DEV_URL = `http://localhost:${DEV_PORT}`;
const PROD_PORT = process.env.NUDGE_UI_PROD_PORT ?? "4173";
const PROD_URL = `http://localhost:${PROD_PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: DEV_URL, trace: "on-first-retry" },
  projects: [
    { name: "dev", use: { ...devices["Desktop Chrome"], baseURL: DEV_URL }, testMatch: /.*\.dev\.spec\.ts/, testIgnore: [/\/tests\/perf\./, /\/tests\/isolation\.dev\.spec\.ts/] },
    { name: "isolation", use: { ...devices["Desktop Chrome"], baseURL: DEV_URL }, testMatch: /isolation\.dev\.spec\.ts/ },
    { name: "prod", use: { ...devices["Desktop Chrome"], baseURL: PROD_URL }, testMatch: /.*\.prod\.spec\.ts/, testIgnore: /\/tests\/perf\./ },
    { name: "perf", use: { ...devices["Desktop Chrome"], baseURL: DEV_URL }, testMatch: /\/tests\/perf\./ },
  ],
  webServer: [
    {
      command: `PORT=${DEV_PORT} pnpm dev --port ${DEV_PORT} --strictPort`,
      url: DEV_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      name: "dev",
    },
    {
      command: `pnpm build && pnpm preview --port ${PROD_PORT} --strictPort`,
      url: PROD_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      name: "prod",
      env: { NODE_ENV: "production" },
    },
  ],
});
