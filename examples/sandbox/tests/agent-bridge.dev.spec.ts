import { test, expect, type Page } from "@playwright/test";
import { createLoopbackBridge, type BrowserBridge } from "@nudge-ui/mcp";
import { getAppFrame, openEditor } from "./editor.ts";

const DEV_PORT = process.env.NUDGE_UI_DEV_PORT ?? "5173";
const APP_ORIGIN = `http://localhost:${DEV_PORT}`;

async function configureBridge(page: Page, bridge: BrowserBridge): Promise<void> {
  const address = bridge.address;
  if (!address) throw new Error("The test bridge did not expose an address.");

  // The browser client normally uses its deterministic project port. An
  // ephemeral port keeps this test isolated from a developer's companion
  // process, so publish this test-only endpoint before the app bootstraps.
  await page.addInitScript(({ baseUrl }) => {
    const target = window as Window & {
      __NUDGE_UI_AGENT_BRIDGE__?: { baseUrl: string };
    };
    target.__NUDGE_UI_AGENT_BRIDGE__ = { baseUrl };
  }, { baseUrl: address.url });
}

type PromptRequest = Awaited<ReturnType<BrowserBridge["waitForPrompt"]>>;

interface PromptListener {
  readonly abort: AbortController;
  readonly promise: Promise<PromptRequest | null>;
}

function startPromptListener(bridge: BrowserBridge): PromptListener {
  const abort = new AbortController();
  return {
    abort,
    promise: bridge.waitForPrompt(abort.signal).catch(() => null),
  };
}

async function connectBrowser(
  page: Page,
  bridge: BrowserBridge,
  promptListener?: PromptListener,
): Promise<PromptListener | null> {
  const listener = promptListener ?? startPromptListener(bridge);

  const eventsResponse = page.waitForResponse((response) => {
    try {
      return new URL(response.url()).pathname === "/events" && response.status() === 200;
    } catch {
      return false;
    }
  });

  const connect = page.locator('[data-test="copy-prompt"]');
  await expect(connect).toHaveText("Connect agent", { timeout: 10_000 });
  await connect.click();
  await eventsResponse;
  await expect(connect).toHaveText("Send prompt", { timeout: 10_000 });

  // Stop this helper's listener after pairing so a Canvas command cannot be
  // mistaken for a prompt.
  if (promptListener) return listener;
  listener.abort.abort();
  await listener.promise;
  return null;
}

test.describe("Nudge MCP browser bridge", () => {
  let bridge: BrowserBridge;

  test.beforeEach(async ({ page }) => {
    bridge = createLoopbackBridge({
      projectId: "sandbox",
      origin: APP_ORIGIN,
      port: 0,
      tokenFactory: () => "e2e-session-token",
      idFactory: () => "e2e-request-id",
    });
    await bridge.start();
    await configureBridge(page, bridge);
  });

  test.afterEach(async () => {
    await bridge.close();
  });

  test("pairs an idle companion from the connection panel and becomes ready when the agent listens", async ({ page }) => {
    await openEditor(page, "/playground");
    const connectionStatus = page.locator('[data-test="agent-connection-status"]');
    await expect(connectionStatus).toContainText("Ready to connect agent");
    await page.locator('[data-test="settings-button"]').click();
    await page.locator('[data-test="settings-nav-mcp"]').click();
    const dialog = page.locator('[data-test="mcp-connection-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-test="mcp-connection-status"]')).toContainText("Ready to connect agent");
    await page.locator('[data-test="mcp-connect"]').click();
    await expect.poll(() => bridge.getStatus().paired).toBe(true);
    expect(bridge.getStatus().listenerActive).toBe(false);
    await expect(page.locator('[data-test="copy-prompt"]')).toHaveText("Copy prompt");
    await expect(connectionStatus).toContainText("Connected, not listening");

    const listener = startPromptListener(bridge);
    try {
      await expect(page.locator('[data-test="copy-prompt"]')).toHaveText("Send prompt");
      await expect(connectionStatus).toContainText("Agent listening");
      await page.locator('[data-test="mcp-disconnect"]').click();
      await expect.poll(() => bridge.getStatus().paired).toBe(false);
    } finally {
      listener.abort.abort();
      await listener.promise;
    }
  });

  test("discovers the listener, pairs explicitly, and delivers one prompt", async ({ page }) => {
    const promptListener = startPromptListener(bridge);
    const app = await openEditor(page, "/playground");
    const activeListener = await connectBrowser(page, bridge, promptListener);
    if (!activeListener) throw new Error("The prompt listener ended before pairing.");

    await app.getByText("Repeated 3", { exact: true }).click();
    await app.getByText("Repeated 3", { exact: true }).press("ArrowUp");
    await expect(app.locator(".repeated-item")).toHaveText([
      "Repeated 1",
      "Repeated 3",
      "Repeated 2",
      "Repeated 4",
      "Repeated 5",
      "Repeated 6",
    ]);

    const send = page.locator('[data-test="copy-prompt"]');
    await expect(send).toBeEnabled();
    await send.click();

    const request = await activeListener.promise;
    if (!request) throw new Error("The prompt listener ended before dispatch.");
    expect(request.projectId).toBe("sandbox");
    expect(request.prompt).toContain("# Requested design changes");
    expect(request.prompt).toContain("## Structural changes");
    expect(request.changeRevision).toEqual(expect.any(Number));
    expect(bridge.getStatus().request?.status).toBe("working");

    bridge.updateRequestStatus({
      requestId: request.requestId,
      status: "completed",
      summary: "Applied the requested structural change.",
    });
    await expect(send).toHaveAttribute("data-agent-state", "completed");
  });

  test("reconciles source-backed iframe CSS and retains text without source evidence", async ({ page }) => {
    const promptListener = startPromptListener(bridge);
    const app = await openEditor(page, "/playground");
    const activeListener = await connectBrowser(page, bridge, promptListener);
    if (!activeListener) throw new Error("The prompt listener ended before pairing.");

    const heading = app.locator("#hero-title");
    await heading.dblclick({ position: { x: 80, y: 30 } });
    const textEditor = app.locator('[data-inline-editor="true"]');
    await textEditor.fill("Source-backed iframe heading");
    await textEditor.press("Enter");

    await app.getByRole("button", { name: "Save" }).click();
    const fontSize = page.locator(
      '[data-test="token-field"][data-property="font-size"] [data-test="raw-input"]',
    );
    await expect(fontSize).toHaveValue("12px");
    await fontSize.fill("22px");
    await fontSize.blur();
    await expect.poll(() => app.locator(".btn").evaluate((element) => getComputedStyle(element).fontSize))
      .toBe("22px");

    await page.locator('[data-test="copy-prompt"]').click();
    const request = await activeListener.promise;
    if (!request) throw new Error("The prompt listener ended before dispatch.");
    expect(request.prompt).toContain("Source-backed iframe heading");
    expect(request.prompt).toContain("font-size");

    await app.locator("body").evaluate(() => {
      document.querySelector("#hero-title")!.textContent = "Source-backed iframe heading";
      const sourceStyle = document.createElement("style");
      sourceStyle.dataset.test = "agent-source-style";
      sourceStyle.textContent = ".btn { font-size: 22px; }";
      document.head.append(sourceStyle);
    });
    bridge.updateRequestStatus({
      requestId: request.requestId,
      status: "completed",
      summary: "Applied iframe text and CSS to source.",
    });

    await expect(page.locator('[data-test="changes-log"] [data-test="change-row"]')).toHaveCount(1);
    await expect(page.locator('[data-test="changes-log"] [data-test="change-row"]'))
      .toContainText("Source-backed iframe heading");
    await expect(heading).toHaveText("Source-backed iframe heading");
    await expect.poll(() => app.locator(".btn").evaluate((element) => getComputedStyle(element).fontSize))
      .toBe("22px");
  });

  test("keeps pending edits when the preview document navigates during verification", async ({ page }) => {
    const promptListener = startPromptListener(bridge);
    const app = await openEditor(page, "/playground");
    const activeListener = await connectBrowser(page, bridge, promptListener);
    if (!activeListener) throw new Error("The prompt listener ended before pairing.");

    await app.getByRole("button", { name: "Save" }).click();
    const fontSize = page.locator(
      '[data-test="token-field"][data-property="font-size"] [data-test="raw-input"]',
    );
    await fontSize.fill("23px");
    await fontSize.blur();
    await page.locator('[data-test="copy-prompt"]').click();
    const request = await activeListener.promise;
    if (!request) throw new Error("The prompt listener ended before dispatch.");

    await app.locator('a[href="/conformance"]').click();
    await expect.poll(async () => (await getAppFrame(page)).url())
      .toContain("/conformance");
    bridge.updateRequestStatus({
      requestId: request.requestId,
      status: "completed",
      summary: "Preview navigated before source verification.",
    });

    await expect(page.locator('[data-test="copy-prompt"]')).toHaveAttribute("data-agent-state", "completed");
    await expect(page.locator('[data-test="changes-log"] [data-test="change-row"]')).toHaveCount(1);
  });

  test("presents three same-origin routes in Canvas and reports readiness", async ({ page }) => {
    await openEditor(page, "/playground");
    await connectBrowser(page, bridge);

    const routes = [
      { url: `${APP_ORIGIN}/playground?agent-variant=one`, title: "Direction one", label: "Direction 1" },
      { url: `${APP_ORIGIN}/playground?agent-variant=two`, title: "Direction two", label: "Direction 2" },
      { url: `${APP_ORIGIN}/conformance`, title: "Direction three", label: "Direction 3" },
    ];
    const result = await bridge.dispatchCanvasCommand({
      type: "present-routes",
      groupId: "agent-e2e-routes",
      label: "Agent landing page directions",
      routes,
    });

    expect(result.ok).toBe(true);
    expect(result.group?.id).toBe("agent-e2e-routes");
    expect(result.group?.label).toBe("Agent landing page directions");
    expect(result.group?.routes.map((route) => route.label)).toEqual([
      "Direction 1",
      "Direction 2",
      "Direction 3",
    ]);
    expect(result.state?.mode).toBe("canvas");

    await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
    await expect(page.locator('[data-test="canvas-board"] .canvas-card')).toHaveCount(4);
    await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0, { timeout: 10_000 });
  });
});
