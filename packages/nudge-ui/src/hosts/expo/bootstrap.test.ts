// @vitest-environment jsdom
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createExpoBootstrapScript, writeExpoBootstrap } from "./bootstrap.ts";

function run(href: string): void {
  window.history.replaceState(null, "", href);
  // The script is what Metro runs as a polyfill, so it is evaluated as plain script text.
  new Function(createExpoBootstrapScript())();
}

afterEach(() => {
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("data-nudge-ui-editor");
  delete (window as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__;
});

describe("Expo web bootstrap", () => {
  it("adds the client once and installs the renderer capture", () => {
    run("/rides");
    run("/rides");

    const scripts = document.querySelectorAll("script[data-nudge-ui-client]");
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.getAttribute("src")).toBe("/__nudge_ui__/client.mjs");
    expect(scripts[0]?.getAttribute("data-nudge-ui-manifest")).toBe("/__nudge_ui__/manifest");
    expect((window as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__).toBeDefined();
  });

  it("does nothing inside the editor document", () => {
    document.documentElement.setAttribute("data-nudge-ui-editor", "");
    run("/__nudge_ui__/editor");

    expect(document.querySelector("script[data-nudge-ui-client]")).toBeNull();
  });

  it("is plain script text a polyfill can carry", () => {
    expect(() => new Function(createExpoBootstrapScript())).not.toThrow();
    expect(createExpoBootstrapScript()).not.toMatch(/\bimport\b|\brequire\(/);
  });
});

describe("Expo bootstrap file", () => {
  let root: string | null = null;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = null;
  });

  it("writes an ignored file and leaves it alone when nothing changed", () => {
    root = mkdtempSync(join(tmpdir(), "nudge-expo-"));
    const path = writeExpoBootstrap(root);
    const written = statSync(path).mtimeMs;
    writeExpoBootstrap(root);

    expect(path).toBe(join(root, ".nudge", "expo", "bootstrap.js"));
    expect(readFileSync(join(root, ".nudge", "expo", ".gitignore"), "utf8")).toBe("*\n");
    expect(statSync(path).mtimeMs).toBe(written);
  });
});
