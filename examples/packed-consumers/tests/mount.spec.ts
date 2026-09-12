import { expect, test } from "@playwright/test";

interface NudgeUiWindow extends Window {
  __nudgeUi?: { version?: number };
}

const adapter = process.env.NUDGE_UI_PACKED_ADAPTER;
const url = process.env.NUDGE_UI_PACKED_URL;
const expectedApplicationText = process.env.NUDGE_UI_PACKED_EXPECTED_TEXT;

if (!adapter || !url) {
  throw new Error("The packed-consumer harness must provide an Adapter name and URL.");
}

test(`${adapter}: the packed Adapter mounts the versioned browser bridge`, async ({ page }) => {
  const diagnostics: string[] = [];
  const reactIdentityDiagnostics: string[] = [];
  page.on("console", (message) => {
    if (/invalid hook call|more than one copy of react|different versions of react/i.test(message.text())) {
      reactIdentityDiagnostics.push(`console: ${message.text()}`);
    }
    if (message.type() === "error") diagnostics.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    if (/invalid hook call|more than one copy of react|different versions of react/i.test(error.message)) {
      reactIdentityDiagnostics.push(`pageerror: ${error.message}`);
    }
    diagnostics.push(`pageerror: ${error.message}`);
  });

  await page.goto(url);
  try {
    await expect.poll(() => page.evaluate(() => {
      const host = document.getElementById("nudge-ui-root");
      const bridge = (window as NudgeUiWindow).__nudgeUi;
      return {
        hasShadowRoot: Boolean(host?.shadowRoot),
        bridgeVersion: bridge?.version ?? null,
      };
    }), { timeout: 30_000 }).toEqual({
      hasShadowRoot: true,
      bridgeVersion: 1,
    });
    if (expectedApplicationText) {
      await expect(page.locator("body")).toContainText(expectedApplicationText);
    }
    expect(reactIdentityDiagnostics, reactIdentityDiagnostics.join("\n")).toEqual([]);
  } catch (error) {
    throw new Error(
      `Packed Adapter did not mount.\n${diagnostics.length > 0 ? diagnostics.join("\n") : "No browser errors were reported."}`,
      { cause: error },
    );
  }
});
