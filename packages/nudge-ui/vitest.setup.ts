// jsdom's selector engine takes ~200ms to evaluate `:modal`, and Floating UI
// checks it on every popup position update, so tests that open a popup can
// exceed their timeout on slow runners. jsdom has no top layer, so no element
// is ever modal.
if (typeof Element !== "undefined") {
  const matches = Element.prototype.matches;
  Element.prototype.matches = function (selectors: string): boolean {
    return selectors === ":modal" ? false : matches.call(this, selectors);
  };
}
