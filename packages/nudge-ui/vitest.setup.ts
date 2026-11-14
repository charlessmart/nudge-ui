// jsdom has no top layer, so nothing is modal; stubbing :modal skips Floating UI's slow per-update check.
if (typeof Element !== "undefined") {
  const matches = Element.prototype.matches;
  Element.prototype.matches = function (selectors: string): boolean {
    return selectors === ":modal" ? false : matches.call(this, selectors);
  };
}

// Unit tests have no frame to preview a draft in, so the active draft is applied to the test document directly.
if (typeof document !== "undefined") {
  const { installLoopbackRenderer } = await import("./src/inspector/__stubs__/loopbackRenderer.ts");
  installLoopbackRenderer();
}
