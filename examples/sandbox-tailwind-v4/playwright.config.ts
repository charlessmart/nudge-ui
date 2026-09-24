import { defineConfig, devices } from "@playwright/test";

// Automated browsers get the plain app unless the dev server opts in.
process.env.NUDGE_UI ??= "1";

const DEV_PORT = process.env.NUDGE_UI_DEV_PORT ?? "5174";
const PROD_PORT = process.env.NUDGE_UI_PROD_PORT ?? "4174";
const DEV_URL = `http://127.0.0.1:${DEV_PORT}`;
const PROD_URL = `http://127.0.0.1:${PROD_PORT}`;

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: { ...devices["Desktop Chrome"], baseURL: DEV_URL, trace: "on-first-retry" },
  projects: [
    { name: "compat-chromium", use: { ...devices["Desktop Chrome"], baseURL: DEV_URL }, testMatch: /compatibility\.dev\.spec\.ts/ },
    { name: "compat-firefox", use: { ...devices["Desktop Firefox"], baseURL: DEV_URL }, testMatch: /compatibility\.dev\.spec\.ts/ },
    { name: "compat-webkit", use: { ...devices["Desktop Safari"], baseURL: DEV_URL }, testMatch: /compatibility\.dev\.spec\.ts/ },
    { name: "dev", use: { ...devices["Desktop Chrome"], baseURL: DEV_URL }, testMatch: /(?:tailwind-landing|isolation|token-picker|at-rule-context|components)\.dev\.spec\.ts/ },
    { name: "prod", use: { ...devices["Desktop Chrome"], baseURL: PROD_URL }, testMatch: /nudge-ui\.prod\.spec\.ts/ },
  ],
  webServer: [
    { command: `pnpm dev --port ${DEV_PORT} --strictPort`, url: DEV_URL, reuseExistingServer: !process.env.CI, timeout: 90_000 },
    { command: `pnpm build && pnpm preview --port ${PROD_PORT} --strictPort`, url: PROD_URL, reuseExistingServer: !process.env.CI, timeout: 120_000, env: { NODE_ENV: "production" } },
  ],
});

