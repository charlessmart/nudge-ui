import { defineConfig, devices } from "@playwright/test";

// Automated browsers get the plain app unless the dev server opts in.
process.env.NUDGE_UI ??= "1";

const PORT = process.env.NUDGE_UI_COMPAT_PORT ?? "5176";
const URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "compat-chromium", use: { ...devices["Desktop Chrome"], baseURL: URL }, testMatch: /compatibility\.spec\.ts/ },
    { name: "compat-firefox", use: { ...devices["Desktop Firefox"], baseURL: URL }, testMatch: /compatibility\.spec\.ts/ },
    { name: "compat-webkit", use: { ...devices["Desktop Safari"], baseURL: URL }, testMatch: /compatibility\.spec\.ts/ },
    { name: "dev", use: { ...devices["Desktop Chrome"], baseURL: URL }, testMatch: /(?:isolation|conformance|components|examples)\.dev\.spec\.ts/ },
    { name: "prod", use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${process.env.NUDGE_UI_PROD_PORT ?? "4176"}` }, testMatch: /nudge-ui\.prod\.spec\.ts/ },
  ],
  webServer: [
    { command: `./node_modules/.bin/vite --port ${PORT} --strictPort`, url: URL, reuseExistingServer: !process.env.CI, timeout: 90_000 },
    { command: `pnpm build && pnpm preview --port ${process.env.NUDGE_UI_PROD_PORT ?? "4176"} --strictPort`, url: `http://127.0.0.1:${process.env.NUDGE_UI_PROD_PORT ?? "4176"}`, reuseExistingServer: !process.env.CI, timeout: 120_000, env: { NODE_ENV: "production" } },
  ],
});
