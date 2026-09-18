import { test, expect } from "@playwright/test";
import { appLocator, getAppFrame } from "@nudge-ui/compatibility/playwright";

test("dev: diagonal gaps extend dotted construction lines from hovered edges to selected centrelines", async ({ page }) => {
  await page.goto("/playground");
  await (await getAppFrame(page)).evaluate(() => {
    const addFixture = (id: string, cid: string, left: number, top: number) => {
      const element = document.createElement("div");
      element.id = id;
      element.dataset.cid = cid;
      element.dataset.src = `GuideFixture.tsx:${cid === "HoverFixture" ? 1 : 2}:1`;
      Object.assign(element.style, {
        position: "fixed",
        left: `${left}px`,
        top: `${top}px`,
        width: "160px",
        height: "160px",
        background: "rgb(255 255 255)",
        zIndex: "1",
      });
      document.body.appendChild(element);
    };
    addFixture("measurement-hover", "HoverFixture", 80, 80);
    addFixture("measurement-selected", "SelectedFixture", 620, 520);
  });

  await appLocator(page, "#measurement-selected").click();
  await appLocator(page, "#measurement-hover").hover();
  await page.keyboard.down("Alt");

  await expect.poll(() => page.evaluate(() => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
    const read = (id: string) => {
      const line = root?.querySelector<SVGLineElement>(`[data-segment-id='${id}']`);
      return line ? { horizontal: line.getAttribute("y1") === line.getAttribute("y2"), vertical: line.getAttribute("x1") === line.getAttribute("x2") } : null;
    };
    return {
      horizontalGapProjection: read("projection-horizontal-0"),
      verticalGapProjection: read("projection-vertical-0"),
    };
  })).toEqual({
    horizontalGapProjection: { horizontal: false, vertical: true },
    verticalGapProjection: { horizontal: true, vertical: false },
  });

  await page.keyboard.up("Alt");
});

test("dev: Option/Alt shows viewport guides and selected-to-hovered measurements", async ({ page }) => {
  await page.goto("/playground");

  await appLocator(page, "#hero-title").click();
  await appLocator(page, "button").filter({ hasText: "Save a change" }).hover();
  await page.keyboard.down("Alt");

  await expect.poll(() => page.evaluate(() => {
    const overlay = window.document.getElementById("nudge-ui-root")?.shadowRoot
      ?.querySelector("[data-test='canvas-measurement-overlay']");
    const root = window.document.getElementById("nudge-ui-root")?.shadowRoot;
    return {
      overlay: overlay !== null,
      pointerEvents: overlay ? getComputedStyle(overlay).pointerEvents : null,
      alignmentGuides: root?.querySelectorAll(".alignment-guide").length ?? 0,
      rulers: root?.querySelectorAll("[data-test='measurement-ruler']").length ?? 0,
      projections: root?.querySelectorAll("[data-test='measurement-projection']").length ?? 0,
      labelChips: root?.querySelectorAll("[data-test='measurement-label-chip']").length ?? 0,
      labels: [...(root?.querySelectorAll("[data-test='measurement-label']") ?? [])]
        .map((node) => ({
          text: node.textContent,
          transform: node.getAttribute("transform"),
          fill: getComputedStyle(node).fill,
        })),
    };
  })).toEqual(expect.objectContaining({
    overlay: true,
    pointerEvents: "none",
    alignmentGuides: 4,
    rulers: expect.any(Number),
    projections: expect.any(Number),
    labelChips: expect.any(Number),
    labels: expect.any(Array),
  }));

  const overlay = await page.evaluate(() => {
    const root = window.document.getElementById("nudge-ui-root")?.shadowRoot;
    return {
      rulers: root?.querySelectorAll("[data-test='measurement-ruler']").length ?? 0,
      labels: [...(root?.querySelectorAll("[data-test='measurement-label']") ?? [])]
        .map((node) => ({
          text: node.textContent,
          transform: node.getAttribute("transform"),
          fill: getComputedStyle(node).fill,
        })),
    };
  });
  expect(overlay.rulers).toBeGreaterThan(0);
  expect(overlay.labels.length).toBeGreaterThan(0);
  expect(overlay.labels.every((label) => (
    /^\d+px$/.test(label.text ?? "")
    && label.transform === null
    && label.fill === "rgb(255, 255, 255)"
  ))).toBe(true);

  await page.keyboard.up("Alt");
  await expect.poll(() => page.evaluate(() => window.document.getElementById("nudge-ui-root")?.shadowRoot
    ?.querySelector("[data-test='canvas-measurement-overlay']") === null)).toBe(true);
});

test("dev: Option/Alt guides deactivate over the inspector panel without changing selection", async ({ page }) => {
  await page.goto("/playground");

  await appLocator(page, "#hero-title").click();
  const before = await page.evaluate(() => window.document.getElementById("nudge-ui-root")?.shadowRoot
    ?.querySelector("[data-test='selection']")?.getAttribute("data-selected-cid"));

  await appLocator(page, "button").filter({ hasText: "Save a change" }).hover();
  await page.keyboard.down("Alt");
  await expect.poll(() => page.evaluate(() => window.document.getElementById("nudge-ui-root")?.shadowRoot
    ?.querySelector("[data-test='canvas-measurement-overlay']") !== null)).toBe(true);

  await page.locator('[data-test="inspect-tab"]').hover();
  await expect.poll(() => page.evaluate(() => window.document.getElementById("nudge-ui-root")?.shadowRoot
    ?.querySelector("[data-test='canvas-measurement-overlay']") === null)).toBe(true);

  const after = await page.evaluate(() => window.document.getElementById("nudge-ui-root")?.shadowRoot
    ?.querySelector("[data-test='selection']")?.getAttribute("data-selected-cid"));
  expect(after).toBe(before);
  await page.keyboard.up("Alt");
});
