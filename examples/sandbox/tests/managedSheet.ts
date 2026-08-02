import type { Page } from "@playwright/test";

/** Read the live CSSOM; the managed style element intentionally has no text mirror. */
export async function managedSheetText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const debugWindow = window as Window & {
      __designToolGetManagedSheetText?: () => string;
    };
    if (debugWindow.__designToolGetManagedSheetText) {
      return debugWindow.__designToolGetManagedSheetText();
    }
    const sheet = (document.getElementById("design-tool-styles") as HTMLStyleElement | null)?.sheet;
    return sheet ? Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n") : "";
  });
}
