// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const STYLE_ID = "nudge-ui-interaction-styles";

function installedCss(): string {
  return document.getElementById(STYLE_ID)?.textContent ?? "";
}

describe("interaction styles", () => {
  afterEach(() => {
    document.getElementById(STYLE_ID)?.remove();
    vi.resetModules();
  });

  it("follows data-cid where host adapters tag every element", async () => {
    const { installInteractionStyles } = await import("./interactionStyles.ts");
    const remove = installInteractionStyles(document);

    expect(installedCss()).toContain("[data-cid] *");
    expect(installedCss()).not.toContain("--nudge-ui-spacing-cursor");
    remove();
  });

  it("does not depend on data-cid on the page surface, which tags lazily", async () => {
    const { enablePageSurface } = await import("../canvas/pageSurface.ts");
    enablePageSurface();
    const { installInteractionStyles } = await import("./interactionStyles.ts");
    const remove = installInteractionStyles(document);

    // A selector keyed on a lazily written attribute restyles a subtree for every element the pointer reaches.
    expect(installedCss()).toContain("html, html *");
    expect(installedCss()).not.toContain("[data-cid]");
    expect(installedCss()).toContain("--nudge-ui-spacing-cursor");
    remove();
  });
});
