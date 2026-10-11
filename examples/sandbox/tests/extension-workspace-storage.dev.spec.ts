import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";
import { installExtensionStorage } from "./extensionStorage.ts";

let inspectorBundle: string;
let storageBridge: string;

test.beforeAll(async () => {
  const extension = new URL("../../../packages/chrome-extension/", import.meta.url);
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL("scripts/build.mjs", extension))]);
  [inspectorBundle, storageBridge] = await Promise.all([
    readFile(new URL("dist/nudge-ui.js", extension), "utf8"),
    readFile(new URL("dist/storage-bridge.js", extension), "utf8"),
  ]);
});

async function openInspector(page: Page): Promise<void> {
  await page.route("**/extension-workspace-storage", (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><body style="margin:0"><h1 style="margin:100px">Comment fixture</h1></body></html>',
  }));
  await page.goto("/extension-workspace-storage");
  await page.evaluate(() => {
    Object.assign(window, { __NUDGE_UI_EXTENSION__: { storage: {}, surface: "page" } });
  });
  await page.addScriptTag({ content: storageBridge });
  await page.addScriptTag({ content: inspectorBundle });
}

function savedNotes(stored: Map<string, unknown>): string[] {
  const value = [...stored.entries()].find(([key]) => key.endsWith(":comments:v1"))?.[1];
  const comments = JSON.parse(typeof value === "string" ? value : "[]") as { note: string }[];
  return comments.map((comment) => comment.note);
}

async function addNote(page: Page, stored: Map<string, unknown>, note: string): Promise<void> {
  await page.locator('[data-test="canvas-tool-comment"]').click();
  await page.locator("h1").click();
  await page.locator('[data-test="comment-input"]').fill(note);
  await page.locator('[data-test="comment-confirm"]').click();
  await expect.poll(() => savedNotes(stored)).toContain(note);
}

async function toggle(page: Page): Promise<void> {
  await page.evaluate(() => {
    const loaded = (window as Window & { __NUDGE_UI_PAGE_INSPECTOR__?: { toggle(): void } }).__NUDGE_UI_PAGE_INSPECTOR__;
    if (!loaded) throw new Error("The extension inspector did not start.");
    loaded.toggle();
  });
}

test("extension takeover locks the previous owner before reading saved state", async ({ page, context }) => {
  const stored = await installExtensionStorage(page);
  await openInspector(page);
  await addNote(page, stored, "Original note");
  const second = await context.newPage();
  let holdNextRead = false;
  let announceRead!: () => void;
  let finishRead!: () => void;
  const readStarted = new Promise<void>((resolve) => { announceRead = resolve; });
  const readGate = new Promise<void>((resolve) => { finishRead = resolve; });
  await installExtensionStorage(second, stored, async () => {
    if (!holdNextRead) return;
    holdNextRead = false;
    announceRead();
    await readGate;
  });
  await openInspector(second);
  await expect(second.locator('[data-test="takeover-here"]')).toBeVisible();
  holdNextRead = true;
  await second.locator('[data-test="takeover-here"]').click();
  await readStarted;
  try {
    await expect(page.locator('[data-test="takeover-here"]')).toBeVisible();
    await expect(second.locator('[data-test="canvas-tool-comment"]')).toHaveCount(0);
  } finally {
    finishRead();
  }
  await addNote(second, stored, "New owner note");

  expect(savedNotes(stored)).toEqual(["Original note", "New owner note"]);
});

test("extension remount preserves notes saved by another owner", async ({ page, context }) => {
  const stored = await installExtensionStorage(page);
  await openInspector(page);
  await addNote(page, stored, "Original note");
  const second = await context.newPage();
  await installExtensionStorage(second, stored);
  await openInspector(second);
  await expect(second.locator('[data-test="takeover-here"]')).toBeVisible();
  await toggle(page);
  await toggle(second);
  await toggle(second);
  await addNote(second, stored, "Second owner note");
  await toggle(second);
  await toggle(page);
  await addNote(page, stored, "First owner remounted");

  expect(savedNotes(stored)).toEqual(["Original note", "Second owner note", "First owner remounted"]);
});
