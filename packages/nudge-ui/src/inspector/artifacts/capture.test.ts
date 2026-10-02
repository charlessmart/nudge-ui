// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { captureHtmlStudy } from "./capture.ts";

describe("HTML study capture", () => {
  it("keeps rendered text and input state while removing application scripts and navigation", async () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write('<!doctype html><html><head><style>main { color: red; }</style><script>window.app = true</script></head><body><main data-cid="html:main" data-renderer-id="r1"><a href="/elsewhere">Hello</a><input value="old"></main></body></html>');
    doc.close();
    doc.querySelector("input")!.value = "new";

    const html = await captureHtmlStudy(frame);
    expect(html).toContain('data-cid="html:main"');
    expect(html).not.toContain("data-renderer-id");
    expect(doc.querySelector("main")!.getAttribute("data-renderer-id")).toBe("r1");
    expect(html).toContain('value="new"');
    expect(html).toContain("Hello");
    expect(html).not.toContain("window.app");
    expect(html).not.toContain('href="/elsewhere"');
    expect(html).toContain("color: red");
    expect(html).not.toContain('style="color: red');
    frame.remove();
  });

  it("preserves authored responsive rules, inline values, and stylesheet media in their cascade order", async () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(`<html><head>
      <style>.layout { width: 100%; display: grid; grid-template-columns: 1fr 1fr; }</style>
      <style media="(max-width: 600px)">.layout { grid-template-columns: 1fr; }</style>
      <style id="nudge-ui-styles" data-nudge-ui="managed"></style>
    </head><body><main class="layout" style="padding: 2vw; width: calc(100% - 4vw)"></main>
      <picture><source media="(max-width: 600px)" srcset="/mobile.png"><img src="data:image/png;base64,AA==" srcset="/desktop.png 2x"></picture>
    </body></html>`);
    doc.close();
    // Projection edits are inserted through CSSOM, so cloning text alone loses them.
    doc.querySelector<HTMLStyleElement>("#nudge-ui-styles")!.sheet!.insertRule(".layout { color: purple; }");

    const html = await captureHtmlStudy(frame);
    const captured = new DOMParser().parseFromString(html, "text/html");
    const layout = captured.querySelector<HTMLElement>(".layout")!;
    expect(layout.style.width).toBe("calc(100% - 4vw)");
    expect(layout.style.padding).toBe("2vw");
    const styles = [...captured.querySelectorAll("style")];
    expect(styles[0]!.textContent).toContain("width: 100%");
    expect(styles[1]!.getAttribute("media")).toBe("(max-width: 600px)");
    expect(styles[1]!.textContent).toContain("grid-template-columns: 1fr");
    expect(styles[2]!.textContent).toContain("color: purple");
    expect(captured.querySelector("#nudge-ui-styles")).toBeNull();
    expect(captured.querySelector("source")!.getAttribute("srcset")).toBe("/mobile.png");
    expect(captured.querySelector("img")!.getAttribute("srcset")).toBe("/desktop.png 2x");
    frame.remove();
  });

});
