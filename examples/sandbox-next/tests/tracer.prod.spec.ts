import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * ADR-0010 production strip proof: `next build` output contains no identity
 * attributes, no inspector mount point, and no manifest transport. The plan
 * specifies grep-style checks against the BUILT OUTPUT — rendered-HTML
 * assertions are kept as a complement but cannot substitute for artifact
 * inspection (client-side injection would be invisible to them).
 */

const PROJECT_ROOT = join(import.meta.dirname, "..");
const BUILD_DIR = join(PROJECT_ROOT, ".next");

/** Every JS/HTML/text artifact Turbopack wrote for this build. */
function buildArtifacts(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs|cjs|html|css|rsc|json|txt)$/.test(entry.name)) files.push(full);
    }
  };
  // Both output trees exist depending on flags: server + static chunks.
  walk(join(BUILD_DIR, "static"));
  walk(join(BUILD_DIR, "server"));
  walk(join(BUILD_DIR, "standalone"));
  return files;
}

test("prod: build artifacts contain no identity attributes", async () => {
  const artifacts = buildArtifacts();
  expect(artifacts.length).toBeGreaterThan(0);

  const offenders = artifacts.filter((file) => {
    const content = readFileSync(file, "utf8");
    return content.includes("data-cid=") || content.includes("data-src=");
  });
  expect(offenders).toEqual([]);
});

test("prod: build artifacts contain no mount or bootstrap references", async () => {
  const offenders = buildArtifacts().filter((file) => {
    const content = readFileSync(file, "utf8");
    return (
      content.includes("NudgeUiMount")
      || content.includes("__NudgeUiCreateElement")
      || content.includes("nudge-ui-root")
    );
  });
  expect(offenders).toEqual([]);
});

test("prod: rendered output is clean too (complement to artifact greps)", async ({
  page,
}) => {
  await page.goto("/");
  const html = await page.content();
  expect(html).not.toContain("data-cid");
  expect(html).not.toContain("NudgeUiMount");
  expect(await page.evaluate(() => Boolean(document.getElementById("nudge-ui-root")))).toBe(
    false,
  );
});

test("prod: manifest transport is unreachable", async ({ request }) => {
  const response = await request.get("/__nudge_ui__/manifest");
  expect(response.status()).toBeGreaterThanOrEqual(400);
});

test("prod: no sidecar state file exists in the project", async () => {
  // The sidecar never starts outside development, so its port record is
  // never written into .next.
  expect(existsSync(join(BUILD_DIR, "nudge-ui-sidecar.json"))).toBe(false);
});
