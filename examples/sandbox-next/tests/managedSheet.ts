import type { Frame, Page } from "@playwright/test";

/** Read the live CSSOM rather than the in-memory diagnostic mirror. */
export async function managedSheetText(surface: Page | Frame): Promise<string> {
  return surface.evaluate(() => {
    const sheet = (document.getElementById("nudge-ui-styles") as HTMLStyleElement | null)?.sheet;
    return sheet ? Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n") : "";
  });
}
