// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { getElementComputedStyle, getElementWindow, isShadowRootInDocument } from "./domRealm.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DOM realm helpers", () => {
  it("uses an iframe element's own Window and computed styles", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const frameDocument = iframe.contentDocument!;
    const element = frameDocument.createElement("div");
    element.style.paddingTop = "13px";
    frameDocument.body.appendChild(element);

    expect(getElementWindow(element)).toBe(iframe.contentWindow);
    expect(getElementComputedStyle(element).paddingTop).toBe("13px");
  });

  it("recognises ShadowRoots from an iframe realm", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const frameDocument = iframe.contentDocument!;
    const host = frameDocument.createElement("div");
    frameDocument.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });

    expect(shadow instanceof window.ShadowRoot).toBe(false);
    expect(isShadowRootInDocument(shadow, frameDocument)).toBe(true);
  });
});
