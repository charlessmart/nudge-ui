import { defineConfig, devices } from "@playwright/test";

const newvatoCheckout = process.env["NEWVATO_CHECKOUT"];
if (!newvatoCheckout) {
  throw new Error(
    "NEWVATO_CHECKOUT is required. Run pnpm test:newvato so the consumer runner can validate the checkout first.",
  );
}

const port = process.env["NUDGE_UI_NEWVATO_PORT"] ?? "5189";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: /newvato-consumer\.dev\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm --workspace=web run dev:nudge-ui -- --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: newvatoCheckout,
    env: {
      NODE_ENV: "development",
      VITE_NUDGE_UI: "true",
      VITE_NUDGE_UI_E2E: "true",
    },
    url: `${baseURL}/__nudge-ui/e2e`,
    reuseExistingServer: false,
    timeout: 120_000,
    name: "newvato-web",
  },
  projects: [
    {
      name: "newvato",
      testMatch: /newvato-consumer\.dev\.spec\.ts/,
    },
  ],
});
