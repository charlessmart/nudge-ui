import { test, expect, type Page } from "@playwright/test";
import { createLoopbackBridge, type BrowserBridge } from "@nudge-ui/mcp";

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
    await page.goto("/playground");
    const connectionStatus = page.locator('[data-test="agent-connection-status"]');
    await expect(connectionStatus).toContainText("Ready to connect");
    await page.locator('[data-test="settings-button"]').click();
    await page.locator('[data-test="settings-nav-mcp"]').click();
    const dialog = page.locator('[data-test="mcp-connection-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-test="mcp-connection-status"]')).toContainText("Ready to connect");
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
    await page.goto("/playground");
    const activeListener = await connectBrowser(page, bridge, promptListener);
    if (!activeListener) throw new Error("The prompt listener ended before pairing.");

    await page.getByText("Repeated 3", { exact: true }).click();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator(".repeated-item")).toHaveText([
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

  test("presents three same-origin routes in Canvas and reports readiness", async ({ page }) => {
    await page.goto("/playground");
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
    await expect(page.locator('[data-test="canvas-board"] .canvas-card')).toHaveCount(3);
    await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0, { timeout: 10_000 });
  });
});
