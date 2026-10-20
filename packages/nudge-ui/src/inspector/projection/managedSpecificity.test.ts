// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyRules, getManagedSheetText, removeManagedSheet } from "./managedStylesheet.ts";
import { boostManagedStylesheet } from "./managedSpecificity.ts";
import { disposeBrowserCssInspection } from "../inspection/browserCssInspectionRegistry.ts";

const TARGET = '[data-cid="Button"][data-src="src/App.tsx:1:1"]';
const BOOST = ":not([data-nudge-ui-boost])";

function siteCss(css: string): void {
  const style = document.createElement("style");
  style.setAttribute("data-test", "site");
  style.textContent = css;
  document.head.prepend(style);
}

describe("managed rule specificity", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="landing"><a class="button" id="cta" data-cid="Button" data-src="src/App.tsx:1:1"></a></div>';
  });

  afterEach(() => {
    removeManagedSheet();
    document.head.querySelectorAll('[data-test="site"], #renderer').forEach((node) => node.remove());
    document.body.innerHTML = "";
    disposeBrowserCssInspection(document);
  });

  it("ties a stronger author rule for the same property", () => {
    siteCss(".button, .landing a.button { box-shadow: inset 0 0 0 1px red; }");
    applyRules([{ selector: TARGET, declarations: { "box-shadow": "0 0 0 1px red" } }]);
    expect(getManagedSheetText()).toBe(`${TARGET}${BOOST} { box-shadow: 0 0 0 1px red; }`);
  });

  it("leaves the selector alone when it already wins or the property differs", () => {
    siteCss("a.button { box-shadow: none; } .landing a.button { color: red; }");
    applyRules([{ selector: TARGET, declarations: { "box-shadow": "0 0 0 1px red" } }]);
    expect(getManagedSheetText()).toBe(`${TARGET} { box-shadow: 0 0 0 1px red; }`);
  });

  it("treats a shorthand as competing with its longhands", () => {
    siteCss(".landing a.button { background: red; }");
    applyRules([{ selector: TARGET, declarations: { "background-color": "blue" } }]);
    expect(getManagedSheetText()).toContain(`${TARGET}${BOOST} {`);
  });

  it("ignores interaction-state rules for a base edit but counts them for that state", () => {
    siteCss(".landing a.button:hover { color: red; }");
    applyRules([{ selector: TARGET, declarations: { color: "blue" } }]);
    expect(getManagedSheetText()).toBe(`${TARGET} { color: blue; }`);
    applyRules([{ selector: `${TARGET}:hover`, declarations: { color: "blue" } }]);
    expect(getManagedSheetText()).toBe(`${TARGET}:hover${BOOST} { color: blue; }`);
  });

  it("ignores important author rules, which stay a reported conflict", () => {
    siteCss(".landing a.button { background: red !important; }");
    applyRules([{ selector: TARGET, declarations: { background: "blue" } }]);
    expect(getManagedSheetText()).toBe(`${TARGET} { background: blue; }`);
  });

  it("adds an ID-weight boost for ID selectors", () => {
    siteCss("#cta { color: red; }");
    applyRules([{ selector: TARGET, declarations: { color: "blue" } }]);
    expect(getManagedSheetText()).toBe(`${TARGET}:not(#nudge-ui-boost) { color: blue; }`);
  });

  it("raises serialized Canvas CSS in place", () => {
    siteCss(".landing a.button { color: red; }");
    const renderer = document.createElement("style");
    renderer.id = "renderer";
    renderer.textContent = `@media screen { ${TARGET} { color: blue; } }`;
    document.head.appendChild(renderer);
    boostManagedStylesheet(document, renderer.sheet!);
    const media = renderer.sheet!.cssRules[0] as CSSMediaRule;
    expect((media.cssRules[0] as CSSStyleRule).selectorText).toBe(`${TARGET}${BOOST}`);
  });
});
