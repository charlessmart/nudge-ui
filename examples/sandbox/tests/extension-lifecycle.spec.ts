import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium, expect, test as base, type BrowserContext, type Page } from "@playwright/test";

const extensionDirectory = fileURLToPath(new URL("../../../packages/chrome-extension/dist/", import.meta.url));

interface InstalledExtension {
  context: BrowserContext;
  origin: string;
  toggle(page: Page): Promise<void>;
  ruleIds(): Promise<number[]>;
  savedState(): Promise<Record<string, unknown>>;
  holdEditorResponse(): { requested: Promise<void>; release(): void };
}

const test = base.extend<{ extension: InstalledExtension }>({
  extension: async ({}, use, testInfo) => {
    let editorGate: Promise<void> | undefined;
    let editorRequested: (() => void) | undefined;
    const server = createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.searchParams.has("nudge-ui") && editorGate) {
        editorRequested?.();
        await editorGate;
      }
      if (url.pathname === "/worker.js") {
        response.setHeader("Content-Type", "application/javascript");
        response.end(`
          self.addEventListener('install', () => self.skipWaiting());
          self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
          self.addEventListener('fetch', event => {
            if (event.request.mode === 'navigate') event.respondWith(Promise.resolve(new Response(
              '<!doctype html><html><body><h1 id="heading">Worker page</h1></body></html>',
              { headers: { 'Content-Type': 'text/html', 'X-Frame-Options': 'DENY' } }
            )));
          });
        `);
        return;
      }
      response.setHeader("Content-Type", "text/html");
      response.setHeader("X-Frame-Options", "DENY");
      response.setHeader("Content-Security-Policy", "default-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
      const meta = url.pathname === "/meta"
        ? '<meta http-equiv="Content-Security-Policy" content="frame-src &#39;none&#39;">'
        : url.pathname === "/meta-external"
          ? '<meta http-equiv="Content-Security-Policy" content="frame-src https://example.invalid">'
          : "";
      const hidden = url.pathname === "/hidden" ? ' style="display:none" hidden inert' : "";
      response.end(`<!doctype html><html><head>${meta}<style>body{margin:40px}</style></head>
        <body${hidden}><h1 id="heading">Extension fixture</h1><script>
          document.body.removeAttribute('hidden'); document.body.removeAttribute('inert');
          document.body.style.display='block'; window.applicationRan=true;
        </script></body></html>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture server did not start.");
    const origin = `http://127.0.0.1:${address.port}`;
    const profile = await mkdtemp(join(tmpdir(), "nudge-extension-"));
    let context: BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(profile, {
        channel: "chromium", headless: true,
        args: [
          `--disable-extensions-except=${extensionDirectory}`,
          `--load-extension=${extensionDirectory}`,
          "--enable-unsafe-extension-debugging",
        ],
      });
      const browser = context.browser();
      if (!browser) throw new Error("Extension browser did not start.");
      const cdp = await browser.newBrowserCDPSession();
      const { extensions } = await cdp.send("Extensions.getExtensions");
      const extension = extensions.find((item) => item.name === "Nudge UI");
      if (!extension) throw new Error("Nudge UI extension did not load.");
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      const logs: string[] = [];
      context.on("page", (page) => {
        page.on("console", (message) => {
          if (message.type() === "error" || message.type() === "warning") logs.push(message.text());
        });
        page.on("pageerror", (error) => logs.push(error.stack ?? error.message));
      });
      await use({
        context, origin,
        async toggle(page) {
          await page.bringToFront();
          // triggerAction needs the browser's tab target, rather than its page target.
          const { targetInfos } = await cdp.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }] });
          const target = targetInfos.find((item) => item.url === page.url());
          if (!target) throw new Error("Fixture tab was not found.");
          await cdp.send("Target.activateTarget", { targetId: target.targetId });
          await cdp.send("Extensions.triggerAction", { id: extension.id, targetId: target.targetId });
        },
        async ruleIds() {
          return worker.evaluate<number[]>("chrome.declarativeNetRequest.getSessionRules().then(rules => rules.map(rule => rule.id))");
        },
        async savedState() {
          return worker.evaluate<Record<string, unknown>>("chrome.storage.local.get(null)");
        },
        holdEditorResponse() {
          let release!: () => void;
          editorGate = new Promise<void>((resolve) => { release = resolve; });
          const requested = new Promise<void>((resolve) => { editorRequested = resolve; });
          return { requested, release };
        },
      });
      if (testInfo.status !== testInfo.expectedStatus) {
        const pages = await Promise.all(context.pages().map(async (page) => ({
          url: page.url(),
          frames: await page.evaluate(() => Array.from(document.querySelector("#nudge-ui-root")?.shadowRoot?.querySelectorAll("iframe") ?? [],
            (frame) => ({ src: frame.src, document: frame.contentDocument?.URL }))).catch(() => []),
        })));
        const diagnostics = testInfo.outputPath("extension-diagnostics.json");
        const actionTitles = await worker.evaluate("chrome.tabs.query({}).then(tabs => Promise.all(tabs.map(async tab => ({ url: tab.url, title: await chrome.action.getTitle({tabId: tab.id}) }))))");
        await writeFile(diagnostics, JSON.stringify({ logs, pages, actionTitles, session: await worker.evaluate("chrome.storage.session.get(null)") }));
        await testInfo.attach("extension-diagnostics", { contentType: "application/json", path: diagnostics });
      }
    } finally {
      await context?.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(profile, { recursive: true, force: true });
    }
  },
});

test.beforeAll(async () => {
  const script = fileURLToPath(new URL("../../../packages/chrome-extension/scripts/build.mjs", import.meta.url));
  await promisify(execFile)(process.execPath, [script]);
});

async function openEditor(extension: InstalledExtension, page: Page, path: string): Promise<void> {
  await page.goto(extension.origin + path);
  await extension.toggle(page);
  await expect(page).toHaveURL(/nudge-ui=editor/);
  await expect(page.locator('[data-test="canvas-tool-comment"]')).toBeVisible();
  await expect(page.frameLocator(".canvas-card__iframe").first().locator("#heading")).toBeVisible();
}

test("resets hidden page bodies and resumes the editor after reload", async ({ extension }) => {
  const page = await extension.context.newPage();
  await openEditor(extension, page, "/hidden");
  expect(await page.evaluate(() => (window as Window & { applicationRan?: boolean }).applicationRan)).toBeUndefined();
  await page.reload();
  await expect(page.locator('[data-test="canvas-tool-comment"]')).toBeVisible();
  await expect(page.frameLocator(".canvas-card__iframe").first().locator("#heading")).toBeVisible();
  await expect(page).toHaveURL(/nudge-ui=editor/);
});

test("a second toolbar click cancels an editor that is still opening", async ({ extension }) => {
  const page = await extension.context.newPage();
  await page.goto(extension.origin + "/pending?value=keep%20this");
  const pending = extension.holdEditorResponse();
  await extension.toggle(page);
  await pending.requested;
  await extension.toggle(page);
  await expect(page).toHaveURL(extension.origin + "/pending?value=keep%20this");
  await expect.poll(() => extension.ruleIds()).toEqual([]);
  pending.release();
  await expect(page.locator("#heading")).toBeVisible();
  await expect(page.locator("#nudge-ui-root")).toHaveCount(0);
});

test("separate tabs keep their own editor rules", async ({ extension }) => {
  const first = await extension.context.newPage();
  await openEditor(extension, first, "/first");
  const second = await extension.context.newPage();
  await second.goto(extension.origin + "/second");
  await extension.toggle(second);
  await expect.poll(() => extension.ruleIds()).toHaveLength(6);
  await expect(first).toHaveURL(/nudge-ui=editor/);
  await expect(second).toHaveURL(/nudge-ui=editor/);
  await expect(first.locator("#nudge-ui-root")).toBeAttached();
  await expect(second.locator("#nudge-ui-root")).toBeAttached();
  const ids = await extension.ruleIds();
  expect(new Set(ids).size).toBe(6);
  await extension.toggle(first);
  await expect(first).toHaveURL(extension.origin + "/first");
  await expect.poll(() => extension.ruleIds()).toHaveLength(3);
  await expect(second.locator("#nudge-ui-root")).toBeAttached();
});

test("takeover preserves notes saved after the locked tab opened", async ({ extension }) => {
  const first = await extension.context.newPage();
  await openEditor(extension, first, "/first");
  const second = await extension.context.newPage();
  await second.goto(extension.origin + "/second");
  await extension.toggle(second);
  await expect(second.locator('[data-test="takeover-here"]')).toBeVisible();

  await first.locator('[data-test="canvas-tool-comment"]').click();
  await first.frameLocator(".canvas-card__iframe").first().locator("#heading").click();
  await first.locator('[data-test="comment-input"]').fill("First tab note");
  await first.locator('[data-test="comment-confirm"]').click();
  await expect.poll(async () => JSON.stringify(await extension.savedState())).toContain("First tab note");

  await second.locator('[data-test="takeover-here"]').click();
  await expect(second.locator('[data-test="canvas-tool-comment"]')).toBeVisible();
  await second.locator('[data-test="canvas-tool-comment"]').click();
  await second.frameLocator(".canvas-card__iframe").first().locator("#heading").click();
  await second.locator('[data-test="comment-input"]').fill("Second tab note");
  await second.locator('[data-test="comment-confirm"]').click();
  await expect.poll(async () => JSON.stringify(await extension.savedState())).toContain("Second tab note");
  expect(JSON.stringify(await extension.savedState())).toContain("First tab note");
});

for (const path of ["/meta", "/meta-external"]) {
  test(`explains a blocked preview on ${path}`, async ({ extension }) => {
    const page = await extension.context.newPage();
    await page.goto(extension.origin + path);
    await extension.toggle(page);
    await expect(page.locator('[data-test="page-inspection-error"]')).toHaveText("Can’t load Nudge on this page due to its security policy.");
    await expect(page.locator('[data-test="empty-state"]')).toHaveCount(0);
  });
}

test("explains unsupported service-worker pages without reloading them", async ({ extension }) => {
  const page = await extension.context.newPage();
  await page.goto(extension.origin + "/worker");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/worker.js");
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
    }
  });
  await extension.toggle(page);
  await expect(page.locator('[data-test="page-inspection-error"]')).toHaveText("Can’t load Nudge on this page due to its service worker.");
  await expect(page).toHaveURL(extension.origin + "/worker");
  await expect(page.locator("#heading")).toHaveText("Extension fixture");
  await expect.poll(() => extension.ruleIds()).toEqual([]);
});
