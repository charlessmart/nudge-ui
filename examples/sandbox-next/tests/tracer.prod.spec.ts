import { expect, test } from "@playwright/test";

/**
 * ADR-0010 production strip proof: `next build` output contains no identity
 * attributes, no inspector mount point, and no manifest transport.
 */
test("prod: identity attributes absent from rendered output", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).not.toContain("data-cid");
  expect(html).not.toContain("data-src");
  expect(html).not.toContain("data-cprops");
});

test("prod: inspector mount element and bootstrap absent", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => Boolean(document.getElementById("design-tool-root")))).toBe(false);
  const content = await page.content();
  expect(content).not.toContain("DesignToolMount");
  expect(content).not.toContain("__DesignToolCreateElement");
});

test("prod: manifest transport is unreachable", async ({ request }) => {
  const response = await request.get("/__design_tool__/manifest");
  expect(response.status()).toBeGreaterThanOrEqual(400);
});

test("prod: sidecar state file is absent from the project", async ({ request }) => {
  // The sidecar never starts outside development, so no port file exists.
  const response = await request.get("/__design_tool__/reload");
  expect(response.status()).toBeGreaterThanOrEqual(400);
});
