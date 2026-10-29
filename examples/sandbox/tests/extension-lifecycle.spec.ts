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
  savedState(): Promise<Record<string, unknown>>;
}

const test = base.extend<{ extension: InstalledExtension }>({
  extension: async ({}, use, testInfo) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
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
      // Sketch capture rasterizes through a `data:` image; the sketch fixture still refuses `blob:` images.
      const imageSources = url.pathname === "/sketch" ? "; img-src 'self' data:" : "";
      response.setHeader("Content-Security-Policy", `default-src 'self' 'unsafe-inline'; frame-ancestors 'none'${imageSources}`);
      const meta = url.pathname === "/meta"
        ? '<meta http-equiv="Content-Security-Policy" content="frame-src &#39;none&#39;">'
        : url.pathname === "/meta-external"
          ? '<meta http-equiv="Content-Security-Policy" content="frame-src https://example.invalid">'
          : "";
      response.end(`<!doctype html><html><head>${meta}<style>body{margin:40px}</style></head>
        <body><h1 id="heading">Extension fixture</h1><input id="draft"></body></html>`);
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
          // Tab URLs are hidden from the extension without a grant, so the fronted tab identifies the fixture.
          const tabId = await worker.evaluate<number>("chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => tab.id)");
          // The click handler always ends by setting the action title, so a sentinel marks completion.
          const actionTitle = () => worker.evaluate<string>(`chrome.action.getTitle({ tabId: ${tabId} })`);
          for (let attempt = 0; attempt < 3; attempt += 1) {
            await worker.evaluate(`chrome.action.setTitle({ tabId: ${tabId}, title: "pending" })`);
            await cdp.send("Extensions.triggerAction", { id: extension.id, targetId: target.targetId });
            await expect.poll(actionTitle).not.toBe("pending");
            // A CDP-triggered click sometimes misses the `activeTab` grant; the failed attempt injected nothing.
            if (!(await actionTitle()).includes("Cannot access contents of the page")) return;
          }
          throw new Error(`The toolbar click was refused: ${await actionTitle()}`);
        },
        async savedState() {
          return worker.evaluate<Record<string, unknown>>("chrome.storage.local.get(null)");
        },
      });
      if (testInfo.status !== testInfo.expectedStatus) {
        const pages = context.pages().map((page) => page.url());
        const diagnostics = testInfo.outputPath("extension-diagnostics.json");
        const actionTitles = await worker.evaluate("chrome.tabs.query({}).then(tabs => Promise.all(tabs.map(async tab => ({ url: tab.url, title: await chrome.action.getTitle({tabId: tab.id}) }))))");
        await writeFile(diagnostics, JSON.stringify({ logs, pages, actionTitles }));
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

async function openInspector(extension: InstalledExtension, page: Page, path: string): Promise<void> {
  await page.goto(extension.origin + path);
  await extension.toggle(page);
  await expect(page.locator('[data-test="canvas-tool-comment"]')).toBeVisible();
}

test("opens in the page without reloading it, and a second click closes it", async ({ extension }) => {
  const page = await extension.context.newPage();
  await page.goto(extension.origin + "/state?value=keep");
  await page.locator("#draft").fill("unsaved page state");
  await page.evaluate(() => Object.assign(window, { pageSession: "kept" }));
  await extension.toggle(page);
  await expect(page.locator('[data-test="canvas-tool-comment"]')).toBeVisible();
  await expect(page).toHaveURL(extension.origin + "/state?value=keep");
  await expect(page.locator("#draft")).toHaveValue("unsaved page state");
  expect(await page.evaluate(() => (window as Window & { pageSession?: string }).pageSession)).toBe("kept");
  await expect(page.locator(".canvas-card__iframe")).toHaveCount(0);

  await extension.toggle(page);
  await expect(page.locator("#nudge-ui-root")).toHaveCount(0);
  await extension.toggle(page);
  await expect(page.locator('[data-test="canvas-tool-comment"]')).toBeVisible();
});

/** Drags the panel by its header to the left edge and waits for it to settle there. */
async function dockPanelLeft(page: Page): Promise<void> {
  const header = page.locator(".panel__header-row");
  const start = await header.boundingBox();
  if (!start) throw new Error("The panel header is not visible.");
  const viewport = page.viewportSize()!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  // Both sides show as soon as the drag starts, before the pointer nears either; the panel's own side is active.
  await page.mouse.move(start.x + start.width / 2 - 20, start.y + start.height / 2, { steps: 2 });
  await expect(page.locator(".nudge-dock-target")).toHaveCount(2);
  await expect(page.locator(".nudge-dock-target[data-side='right'][data-active]")).toHaveCount(1);
  await page.mouse.move(viewport.width / 4, start.y + 40, { steps: 8 });
  await expect(page.locator(".nudge-dock-target[data-side='left'][data-active]")).toHaveCount(1);
  await expect(page.locator(".nudge-dock-target[data-active]")).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator(".nudge-dock-target")).toHaveCount(0);
  await expect.poll(async () => (await page.locator(".panel").boundingBox())!.x).toBe(8);
}

async function drawStroke(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

test("drags the panel to the other edge and remembers the side", async ({ extension }) => {
  const page = await extension.context.newPage();
  await openInspector(extension, page, "/dock");
  const panel = page.locator(".panel");
  expect((await panel.boundingBox())!.x).toBeGreaterThan(page.viewportSize()!.width / 2);
  // The page, and the inspector's own handles and hover outline that listen on it, sit the drag out.
  await page.evaluate(() => {
    const pageEvents: string[] = [];
    for (const type of ["pointermove", "pointerup", "mousemove", "mouseover", "mouseup"]) {
      // Only the drag's own events: a button held down, or the release that ends it.
      document.addEventListener(type, (event) => {
        if ((event as MouseEvent).buttons || type.endsWith("up")) pageEvents.push(type);
      }, true);
    }
    Object.assign(window, { pageEvents });
  });

  await dockPanelLeft(page);
  expect(await page.evaluate(() => (window as Window & { pageEvents?: string[] }).pageEvents)).toEqual([]);
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toHaveCount(0);
  await expect.poll(async () => (await extension.savedState())["panel-side"]).toBe("left");

  await page.reload();
  await extension.toggle(page);
  await expect.poll(async () => (await panel.boundingBox())?.x).toBe(8);
});

test("the hide shortcut and tool keys reach the inspector before the page's own shortcuts", async ({ extension }) => {
  const page = await extension.context.newPage();
  await openInspector(extension, page, "/shortcuts");
  // Stands in for a site's hotkeys, such as GitHub's, which listen on the document.
  await page.evaluate(() => {
    const pageKeys: string[] = [];
    // A modifier pressed on its own is the page's, so only the keys a shortcut ends on are recorded.
    document.addEventListener("keydown", (event) => {
      if (!["Meta", "Control", "Shift", "Alt"].includes(event.key)) pageKeys.push(event.code);
    });
    Object.assign(window, { pageKeys });
  });
  const pageKeys = () => page.evaluate(() => (window as Window & { pageKeys?: string[] }).pageKeys!.splice(0));
  const panel = page.locator(".panel");

  await page.locator("#heading").click();
  await page.keyboard.press("ControlOrMeta+Backslash");
  await expect(panel).toHaveAttribute("data-open", "false");
  await page.keyboard.press("ControlOrMeta+Backslash");
  await expect(panel).toHaveAttribute("data-open", "true");
  await page.keyboard.press("c");
  await expect(page.locator('[data-test="canvas-tool-comment"]')).toHaveAttribute("data-active", "true");
  expect(await pageKeys()).toEqual([]);

  // While the app is in use the page keeps its keys; the tool keys still work alongside.
  await page.locator('[data-test="canvas-tool-select"]').click();
  await page.keyboard.press("c");
  await expect(page.locator('[data-test="canvas-tool-comment"]')).toHaveAttribute("data-active", "true");
  expect(await pageKeys()).toEqual(["KeyC"]);
});

test("sketch marks stay where they were drawn when the panel moves to the other edge", async ({ extension }) => {
  const page = await extension.context.newPage();
  await openInspector(extension, page, "/dock-sketch");
  await page.locator('[data-test="canvas-tool-sketch"]').click();
  await drawStroke(page, { x: 400, y: 200 }, { x: 500, y: 260 });
  const editorStroke = page.locator('[data-test="sketch-live-editor"] [data-test="sketch-svg-layer"] path').first();
  const drawn = (await editorStroke.boundingBox())!;
  // The mark sits under the pointer that drew it, give or take the pen's width.
  expect(Math.abs(drawn.x - 400)).toBeLessThan(10);
  expect(Math.abs(drawn.y - 200)).toBeLessThan(10);
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-test="sketch-live-editor"]')).toHaveCount(0);

  await dockPanelLeft(page);
  const kept = (await page.locator('[data-test="sketch-marks"] path').first().boundingBox())!;
  expect(kept.x).toBeCloseTo(drawn.x, 0);
  expect(kept.y).toBeCloseTo(drawn.y, 0);
  expect(kept.width).toBeCloseTo(drawn.width, 0);

  // Drawing beside the docked panel lands under the pointer too.
  await page.locator('[data-test="canvas-tool-sketch"]').click();
  await drawStroke(page, { x: 700, y: 300 }, { x: 760, y: 340 });
  const second = (await page.locator('[data-test="sketch-live-editor"] [data-test="sketch-svg-layer"] path').last().boundingBox())!;
  expect(Math.abs(second.x - 700)).toBeLessThan(10);
  // The sketch layer spans the window beneath the panel, so the panel still takes its own clicks.
  await page.locator(".panel__header-row").click({ trial: true });
});

test("sketches render under a page policy that blocks blob images", async ({ extension }) => {
  const page = await extension.context.newPage();
  await page.goto(extension.origin + "/sketch");
  // The fixture's `img-src 'self' data:` refuses `<img src="blob:…">`.
  await page.evaluate(() => {
    const violations: string[] = [];
    document.addEventListener("securitypolicyviolation", (event) => violations.push(event.effectiveDirective));
    Object.assign(window, { violations });
  });
  await extension.toggle(page);
  await page.locator('[data-test="canvas-tool-sketch"]').click();
  const bounds = await page.locator(".sketch__live-canvas").boundingBox();
  if (!bounds) throw new Error("The sketch canvas is missing.");
  await page.mouse.move(bounds.x + 100, bounds.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 160, bounds.y + 140, { steps: 4 });
  await page.mouse.up();
  await page.locator('[data-test="sketch-live-prompt-done"]').click();
  await expect(page.locator('[data-test="sketch-live-editor"]')).toHaveCount(0, { timeout: 10_000 });

  await page.locator('[data-test="copy-prompt"]').click();
  const thumbnail = page.locator('[data-test="copy-sketch"] canvas.sketch-thumbnail');
  await expect.poll(() => thumbnail.evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as Window & { violations?: string[] }).violations)).not.toContain("img-src");
});

test("takeover preserves notes saved after the locked tab opened", async ({ extension }) => {
  const first = await extension.context.newPage();
  await openInspector(extension, first, "/first");
  const second = await extension.context.newPage();
  await second.goto(extension.origin + "/second");
  await extension.toggle(second);
  await expect(second.locator('[data-test="takeover-here"]')).toBeVisible();

  await first.locator('[data-test="canvas-tool-comment"]').click();
  await first.locator("#heading").click();
  await first.locator('[data-test="comment-input"]').fill("First tab note");
  await first.locator('[data-test="comment-confirm"]').click();
  await expect.poll(async () => JSON.stringify(await extension.savedState())).toContain("First tab note");

  await second.locator('[data-test="takeover-here"]').click();
  await expect(second.locator('[data-test="canvas-tool-comment"]')).toBeVisible();
  await second.locator('[data-test="canvas-tool-comment"]').click();
  await second.locator("#heading").click();
  await second.locator('[data-test="comment-input"]').fill("Second tab note");
  await second.locator('[data-test="comment-confirm"]').click();
  await expect.poll(async () => JSON.stringify(await extension.savedState())).toContain("Second tab note");
  expect(JSON.stringify(await extension.savedState())).toContain("First tab note");
});

// Framing restrictions no longer matter, because nothing is framed.
for (const path of ["/meta", "/meta-external"]) {
  test(`inspects a page whose policy blocks frames on ${path}`, async ({ extension }) => {
    const page = await extension.context.newPage();
    await openInspector(extension, page, path);
    await page.locator("#heading").click();
    await expect(page.locator('[data-test="canvas-selected-outline"]')).toHaveCount(1);
  });
}

test("inspects a service-worker page without reloading it", async ({ extension }) => {
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
  await expect(page.locator('[data-test="canvas-tool-comment"]')).toBeVisible();
  await expect(page).toHaveURL(extension.origin + "/worker");
  await page.locator("#heading").click();
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toHaveCount(1);
});

/** Asks the bridge for the font list from a page script, which has no trusted gesture to offer. */
function requestFontsFromPage(page: Page): Promise<string> {
  return page.evaluate(() => new Promise<string>((resolve) => {
    const id = 990_001;
    document.addEventListener("nudge-ui:font-list-response", (event) => {
      const response = JSON.parse((event as CustomEvent<string>).detail) as { id: number; families?: string[]; error?: string };
      if (response.id === id) resolve(response.error ?? `${response.families?.length ?? 0} families`);
    });
    document.querySelector("#nudge-ui-root")?.shadowRoot
      ?.querySelector('[data-test="system-fonts-request"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    document.dispatchEvent(new CustomEvent("nudge-ui:font-list-request", { detail: id }));
  }));
}

test("lists system fonts once the user asks, and keeps them from page scripts", async ({ extension }) => {
  const page = await extension.context.newPage();
  await openInspector(extension, page, "/fonts");
  const fontFamily = page.locator('[data-test="token-field"][data-property="font-family"] [data-test="raw-input"]');
  const families = page.locator('[data-test="system-font-item"]');
  const consent = async () => (await extension.savedState())[`system-fonts:${extension.origin}`];

  await page.locator("#heading").click();
  await fontFamily.click();
  await expect(page.locator('[data-test="system-fonts-request"]')).toBeVisible();
  expect(await requestFontsFromPage(page)).toContain("only during a click or key press in Nudge UI");
  expect(await consent()).toBeUndefined();

  await page.locator('[data-test="system-fonts-request"]').click();
  await expect(families.first()).toBeVisible();
  await expect.poll(consent).toBe(true);
  expect(await requestFontsFromPage(page)).toContain("only during a click or key press in Nudge UI");

  await page.reload();
  await extension.toggle(page);
  await expect(page.locator('[data-test="canvas-tool-comment"]')).toBeVisible();
  await page.locator("#heading").click();
  await fontFamily.click();
  await expect(families.first()).toBeVisible();
  await expect(page.locator('[data-test="system-fonts-request"]')).toHaveCount(0);
});

test("asks for system fonts from the keyboard", async ({ extension }) => {
  const page = await extension.context.newPage();
  await openInspector(extension, page, "/fonts");
  const fontFamily = page.locator('[data-test="token-field"][data-property="font-family"] [data-test="raw-input"]');

  await page.locator("#heading").click();
  await fontFamily.click();
  await expect(page.locator('[data-test="system-fonts-request"]')).toBeVisible();
  await fontFamily.press("ArrowDown");
  await expect(page.locator('[data-test="system-fonts-request"]')).toHaveAttribute("data-highlighted", "");
  await fontFamily.press("Enter");

  await expect(page.locator('[data-test="system-font-item"]').first()).toBeVisible();
  await expect.poll(async () => (await extension.savedState())[`system-fonts:${extension.origin}`]).toBe(true);
});
