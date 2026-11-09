// Captures the real Nudge editor, as an npm install shows it (page in the editor frame, panel docked on the right,
// toolbar bottom centre), open on the jukebox browse page from nudge-examples, as one static HTML file. The landing
// page plays it in an iframe under the hero, and public/live-demo/player.js animates it. Re-run this whenever the
// panel changes.
//
// It builds the jukebox, serves the build with `nudge-ui serve` (the static HTML host), and opens the editor there.
//
// Usage: node landing/scripts/capture-live-demo.mjs [path to apps/jukebox] [--no-build]
//   The jukebox defaults to ../nudge-examples/apps/jukebox next to this repo. Build nudge-ui first if its dist is stale.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2);
const jukebox = resolve(args.find((arg) => !arg.startsWith("--")) ?? resolve(repoRoot, "../nudge-examples/apps/jukebox"));
const outDir = new URL("../public/live-demo/", import.meta.url);
const out = new URL("editor.html", outDir);
const assetDir = new URL("assets/", outDir);
const extensions = { "font/woff2": "woff2", "font/woff": "woff", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif" };
const snapshot = readFileSync(new URL("./live-demo-snapshot.js", import.meta.url), "utf8");
const viewport = { width: 1280, height: 720 };

if (!args.includes("--no-build")) {
  const build = spawnSync("npm", ["run", "build"], { cwd: jukebox, stdio: "inherit" });
  if (build.status !== 0) throw new Error(`The jukebox build failed in ${jukebox}.`);
}

// Serve the build on a free port and read the address back from the server's first line.
const server = spawn(process.execPath, [resolve(repoRoot, "packages/nudge-ui/bin/nudge-ui.mjs"), "serve", resolve(jukebox, "dist"), "--port", "0"], { stdio: ["ignore", "pipe", "inherit"] });
const origin = await new Promise((done, fail) => {
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk;
    const match = /at (http:\/\/\S+)/.exec(output);
    if (match) done(match[1]);
  });
  server.once("exit", (code) => fail(new Error(`nudge-ui serve exited with ${code}.`)));
});

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(new URL("?nudge-ui=editor", origin).href);
  const shadow = page.locator("#nudge-ui-root");
  const app = page.frameLocator("iframe.canvas-card__iframe").first();
  await shadow.locator(".panel").waitFor();
  await app.locator(".album-grid img").first().waitFor();
  await page.waitForTimeout(1500);

  // Make sure the select tool is on rather than "use app normally".
  const select = shadow.locator('[aria-label="Interaction tools"] button').first();
  if ((await select.getAttribute("aria-pressed")) !== "true") await select.click();

  // Park the pointer on the empty middle of the panel header, so nothing on the page shows a hover overlay.
  const rest = async () => {
    await page.mouse.move(viewport.width - 180, 28);
    await page.waitForTimeout(500);
  };
  const clickAt = async (box, fx, fy, modifiers = []) => {
    for (const key of modifiers) await page.keyboard.down(key);
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    for (const key of modifiers.reverse()) await page.keyboard.up(key);
    await page.waitForTimeout(700);
  };
  const panelHtml = () => shadow.locator(".panel").evaluate((element) => element.outerHTML);

  // The heading, for the text edit.
  await clickAt(await app.locator("h1").boundingBox(), 0.2, 0.5);
  await rest();
  const headingPanel = await panelHtml();

  // A cover image (one level below its button), for the radius token, plus the open token menu.
  const cover = await app.locator(".album-cover").nth(1).boundingBox();
  await clickAt(cover, 0.5, 0.2);
  await clickAt(cover, 0.5, 0.2, ["Meta"]);
  await rest();
  const coverPanel = await panelHtml();
  await shadow.locator('[aria-label="Change border-radius token"]').click();
  const menu = shadow.locator(".popover-listbox__positioner");
  await menu.waitFor();
  await rest();
  const menuHtml = await menu.evaluate((element) => {
    element.querySelectorAll("[data-highlighted]").forEach((item) => item.removeAttribute("data-highlighted"));
    return element.outerHTML;
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // The "Browse" eyebrow above the heading, for the delete, and the empty panel Nudge shows once nothing is selected.
  await clickAt(await app.locator("main header p").first().boundingBox(), 0.3, 0.5);
  await rest();
  const eyebrowPanel = await panelHtml();
  await page.keyboard.press("Escape");
  await rest();
  const emptyPanel = await panelHtml();

  // The toolbar in pencil mode, with the sketch options bar above it, then back to the select tool.
  await shadow.locator('button[aria-label="Pencil"]').click();
  await page.waitForTimeout(600);
  await rest();
  const sketchToolbar = await shadow.locator(".canvas-toolbar__portal").evaluate((element) => element.innerHTML);
  await page.keyboard.press("Escape");
  await shadow.locator('[aria-label="Interaction tools"] button').first().click();
  await page.waitForTimeout(400);

  // The grid, selected from the gutter between the first two covers: the state the capture starts in.
  const tile = await app.locator(".album-tile").first().boundingBox();
  await page.mouse.click(tile.x + tile.width + 8, tile.y + tile.height * 0.4);
  await page.waitForTimeout(700);
  await rest();

  const { html, files } = await page.evaluate(`(${snapshot})()`);

  // Write each asset once, named by content, and point every token at it. Srcdoc frames share the page's base URL.
  rmSync(assetDir, { recursive: true, force: true });
  mkdirSync(assetDir, { recursive: true });
  let output = html;
  for (const [token, dataUrl] of Object.entries(files)) {
    const [, type, data] = /^data:([^;,]+)[^,]*,(.*)$/s.exec(dataUrl) ?? [];
    if (!type || data === undefined) continue;
    const bytes = Buffer.from(data, "base64");
    const name = `${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}.${extensions[type] ?? "bin"}`;
    writeFileSync(new URL(name, assetDir), bytes);
    output = output.split(token).join(`assets/${name}`);
  }
  const templates = [
    ["live-demo-panel-heading", headingPanel],
    ["live-demo-panel-cover", coverPanel],
    ["live-demo-token-menu", menuHtml],
    ["live-demo-panel-eyebrow", eyebrowPanel],
    ["live-demo-panel-empty", emptyPanel],
    ["live-demo-toolbar-sketch", sketchToolbar],
  ].map(([id, markup]) => `<template id="${id}">${markup}</template>`).join("");
  writeFileSync(out, output.replace(/<\/body>\s*<\/html>\s*$/, `${templates}<script src="player.js" defer></script></body></html>`));
  console.log(`Wrote ${out.pathname} (${(output.length / 1024).toFixed(0)} KB) and ${Object.keys(files).length} assets`);
} finally {
  await browser.close();
  server.kill();
}
