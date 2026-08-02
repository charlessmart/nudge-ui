import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.DT_COMPAT_PORT ?? "5273";
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
  webServer: {
    command: `./node_modules/.bin/vite --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
