import { chromium } from "@playwright/test";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:5177/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/next-live.png" });
console.log(await page.evaluate(() => {
  const sr = document.getElementById("nudge-ui-root").shadowRoot;
  const panel = sr.querySelector(".panel");
  const cs = getComputedStyle(panel);
  return JSON.stringify({
    panelRect: panel.getBoundingClientRect().toJSON(),
    panelPos: cs.position, panelOverflow: cs.overflow, panelDisplay: cs.display,
    panelPE: cs.pointerEvents,
    tokensButtonRect: sr.querySelector('[data-test="tokens-button"]')?.getBoundingClientRect().toJSON(),
  });
}));
await b.close();
