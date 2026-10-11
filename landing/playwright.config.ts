import { defineConfig, devices } from "@playwright/test";

// Defaults to the built public site so tests see exactly what visitors get;
// NUDGE_UI_LANDING_TARGET=dev runs against the dev server instead.
const target = process.env.NUDGE_UI_LANDING_TARGET ?? "prod";
const port = process.env.NUDGE_UI_LANDING_PORT ?? (target === "prod" ? "4180" : "5180");
const baseURL = `http://localhost:${port}`;
const serverCommand = target === "prod"
  ? `pnpm build && pnpm preview --port ${port} --strictPort`
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
    // A reused preview server could be serving a stale build.
    reuseExistingServer: target === "dev" && !process.env.CI,
    timeout: 120_000,
  },
});
