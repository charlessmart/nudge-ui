import { defineConfig, devices } from "@playwright/test";

const port = process.env.NUDGE_UI_LANDING_PORT ?? "5180";
const baseURL = `http://localhost:${port}`;
const target = process.env.NUDGE_UI_LANDING_TARGET ?? "dev";
const serverCommand = target === "prod"
  ? `pnpm preview --port ${port} --strictPort`
  : `pnpm dev --port ${port} --strictPort`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "landing", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: serverCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
