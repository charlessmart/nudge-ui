// jsdom has no top layer, so nothing is modal; stubbing :modal skips Floating UI's slow per-update check.
if (typeof Element !== "undefined") {
  const matches = Element.prototype.matches;
  Element.prototype.matches = function (selectors: string): boolean {
    return selectors === ":modal" ? false : matches.call(this, selectors);
  };
}
