/**
 * Browser-level tracer-bullet proof for the Astro host Adapter (ADR-0011).
 *
 * Requires a dev server already running (default http://localhost:4322,
 * override with SMOKE_BASE_URL). Exits non-zero on the first failed check so
 * it can gate CI later or seed the Stage 6 Playwright suite.
 */
import { chromium } from "@playwright/test";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:4322";

const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(condition, name, detail) {
  if (!condition) throw new Error(`${name} ${detail}`.trim());
  record(name, true, detail);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // Automated browsers get the plain app unless the URL turns the editor on.
  await page.goto(`${BASE_URL}/?nudge-ui=on`, { waitUntil: "domcontentloaded" });

  // The bootstrap module must have executed and mounted the inspector.
  await page.waitForSelector("#nudge-ui-root", { timeout: 30_000 });
  await page.waitForFunction(
    () => Boolean(window.__nudgeUi),
    null,
    { timeout: 30_000 },
  );

  const mountState = await page.evaluate(() => {
    const mount = document.getElementById("nudge-ui-root");
    return {
      present: Boolean(mount),
      shadowContent: Boolean(mount?.shadowRoot && mount.shadowRoot.childElementCount > 0),
    };
  });
  assert(mountState.present, "(a) nudge-ui-root exists");
  assert(
    mountState.shadowContent,
    "(a) inspector mounted content into the mount's shadow root",
  );

  // (b) identity layer on rendered elements.
  const identity = await page.evaluate(() => {
    const element = document.querySelector('[data-cid^="astro:"]');
    if (!(element instanceof HTMLElement)) return null;
    return {
      cid: element.getAttribute("data-cid"),
      src: element.getAttribute("data-src"),
    };
  });
  assert(identity !== null, '(b) an element matches [data-cid^="astro:"]');
  assert(
    typeof identity?.src === "string" && /\.astro:\d+:\d+$/.test(identity.src),
    "(b) that element carries an exact .astro:<line>:<col> data-src",
    identity?.src ?? "(missing)",
  );

  // Astro's own annotations are forwarded untouched in the SERVER response.
  // (The dev toolbar's Audit app strips them from the live DOM shortly after
  // load — exactly the race ADR-0011 avoids by extracting server-side.)
  const rawResponse = await page.request.get(`${BASE_URL}/`);
  const rawHtml = await rawResponse.text();
  const annotatedCount = (rawHtml.match(/data-astro-source-file=/g) ?? []).length;
  assert(
    annotatedCount > 0 && rawHtml.includes('data-cid="astro:'),
    "(b) raw response carries Astro's annotations beside our identity layer",
    `${annotatedCount} annotated elements`,
  );

  // (c) rendering sanity through computed style.
  const styles = await page.evaluate(() => {
    const heading = document.querySelector("h1");
    const button = document.querySelector(".counter-button");
    return {
      headingColor: heading ? getComputedStyle(heading).color : null,
      buttonVisible: button ? getComputedStyle(button).display !== "none" : false,
    };
  });
  assert(styles.headingColor === "rgb(15, 98, 254)", "(c) h1 uses --color-accent", styles.headingColor);
  assert(styles.buttonVisible === true, "(c) island button rendered");

  // Selection smoke via the inspector's public inspection bridge
  // (window.__nudgeUi), installed by bootstrapNudgeUi.
  const inspection = await page.evaluate(() =>
    window.__nudgeUi?.inspect(".site-header .site-title") ?? null,
  );
  assert(inspection !== null, "bridge inspect() returns an inspection");
  assert(
    typeof inspection?.identity.cid === "string" &&
      inspection.identity.cid.startsWith("astro:"),
    "selected element resolves astro: cid",
    inspection?.identity.cid,
  );
  assert(
    typeof inspection?.identity.src === "string" &&
      inspection.identity.src.includes("src/components/Header.astro"),
    "selection carries Header.astro source identity",
    inspection?.identity.src,
  );

  // Second page: multi-page instrumentation.
  await page.goto(`${BASE_URL}/about`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#nudge-ui-root", { timeout: 30_000 });
  const aboutIdentity = await page.evaluate(() => {
    const element = document.querySelector(".page-title");
    return {
      cid: element?.getAttribute("data-cid") ?? null,
      src: element?.getAttribute("data-src") ?? null,
    };
  });
  assert(aboutIdentity.cid?.startsWith("astro:") === true, "/about page-title has astro: cid", aboutIdentity.cid);
  assert(
    /\.astro:\d+:\d+$/.test(aboutIdentity.src ?? ""),
    "/about page-title has exact source",
    aboutIdentity.src,
  );

  console.log("\nAll smoke checks passed.");
} finally {
  await browser.close();
}
