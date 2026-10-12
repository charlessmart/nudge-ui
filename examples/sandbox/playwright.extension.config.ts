import { defineConfig } from "@playwright/test";

// These tests install the extension and serve their own isolated fixtures.
export default defineConfig({
  testDir: "./tests",
  testMatch: "extension-lifecycle.spec.ts",
  workers: 1,
  timeout: 30_000,
});
