import { test, expect } from "@playwright/test";

test("prod: inspector mount point and shell absent in production build (ADR-0002)", async ({ page }) => {
  await page.goto("/");

  const hasMount = await page.evaluate(() => {
    return document.getElementById("nudge-ui-root") !== null;
  });
  expect(hasMount).toBe(false);

  const hasShellTextAnywhere = await page.evaluate(() => {
    function walk(node: Node): boolean {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (el.shadowRoot) {
          if (el.shadowRoot.textContent?.includes("Inspector shell ready")) return true;
          for (const child of Array.from(el.shadowRoot.childNodes)) {
            if (walk(child)) return true;
          }
        }
        if (el.textContent?.includes("Inspector shell ready")) {
          // Text could appear in the host app by coincidence; require it be
          // inside a shadow root to count. Re-check that this match isn't in
          // the light DOM by looking for the panel class instead.
          if (el.classList?.contains("panel") || el.querySelector(".panel")) return true;
        }
        for (const child of Array.from(el.childNodes)) {
          if (walk(child)) return true;
        }
      } else if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent?.includes("Inspector shell ready")) {
          // Light-DOM stray match counts as a leak too.
          return true;
        }
      }
      return false;
    }
    return walk(document.body);
  });
  expect(hasShellTextAnywhere).toBe(false);

  const pageHtml = await page.content();
  expect(pageHtml).not.toContain("nudge-ui-root");
  expect(pageHtml).not.toContain("virtual:nudge-ui-inspector");
});