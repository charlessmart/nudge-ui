import { expect, test } from "@playwright/test";
import { EDITOR_DOCUMENT_POLICY } from "../../../packages/chrome-extension/src/editorPolicy.ts";

test("the extension editor loads sketch blob images and blocks application image requests", async ({ page }) => {
  await page.route("**/extension-sketch-policy", (route) => route.fulfill({
    contentType: "text/html",
    headers: { "content-security-policy": EDITOR_DOCUMENT_POLICY },
    body: "<!doctype html><html><body></body></html>",
  }));
  await page.goto("/extension-sketch-policy");

  const result = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 24;
    canvas.getContext("2d")!.fillRect(0, 0, 32, 24);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((image) => resolve(image!)));
    const url = URL.createObjectURL(blob);
    const sketch = new Image();
    sketch.src = url;
    document.body.append(sketch);
    try {
      await sketch.decode();
      return { width: sketch.naturalWidth, height: sketch.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  expect(result).toEqual({ width: 32, height: 24 });

  const blocked = await page.evaluate(async () => {
    const violation = new Promise<string>((resolve) => {
      document.addEventListener("securitypolicyviolation", (event) => resolve(event.effectiveDirective), { once: true });
    });
    const image = new Image();
    image.src = "/application-image.png";
    document.body.append(image);
    return violation;
  });
  expect(blocked).toBe("img-src");
});
