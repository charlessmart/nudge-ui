import { chromium } from "@playwright/test";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:5177/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/dt-next-live.png" });
console.log(await page.evaluate(() => {
  const sr = document.getElementById("design-tool-root").shadowRoot;
  const panel = sr.querySelector(".dt-panel");
  const cs = getComputedStyle(panel);
  const host = document.getElementById("design-tool-root");
  return JSON.stringify({
    panelRect: panel.getBoundingClientRect().toJSON(),
    panelPos: cs.position, panelOverflow: cs.overflow, panelDisplay: cs.display,
    panelPE: cs.pointerEvents,
    tabsRect: sr.querySelector('[data-test="tokens-tab"]')?.getBoundingClientRect().toJSON(),
  });
}));
await b.close();
