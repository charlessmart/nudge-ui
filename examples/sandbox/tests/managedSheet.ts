import type { Page } from "@playwright/test";

/** Read the live CSSOM rather than the in-memory diagnostic mirror. */
export async function managedSheetText(page: Page): Promise<string> {
  const iframe = page.locator('[data-test^="canvas-card-iframe-"]').first();
  const frame = await iframe.count() > 0
    ? await (await iframe.elementHandle())?.contentFrame()
    : null;
  return (frame ?? page).evaluate(() => {
    const sheet = (document.getElementById("nudge-ui-styles") as HTMLStyleElement | null)?.sheet;
    return sheet ? Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n") : "";
  });
}
