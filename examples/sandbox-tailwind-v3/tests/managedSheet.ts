import type { FrameLocator } from "@playwright/test";

/** Read the live CSSOM; the managed style element intentionally has no text mirror. */
export async function managedSheetText(frame: FrameLocator): Promise<string> {
  return frame.locator("html").evaluate(() => {
    const debugWindow = window as Window & {
      __nudgeUiGetManagedSheetText?: () => string;
    };
    if (debugWindow.__nudgeUiGetManagedSheetText) {
      return debugWindow.__nudgeUiGetManagedSheetText();
    }
    const sheet = (document.getElementById("nudge-ui-styles") as HTMLStyleElement | null)?.sheet;
    return sheet ? Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n") : "";
  });
}
