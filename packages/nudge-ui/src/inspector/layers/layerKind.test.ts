// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { layerKind } from "./layerKind.ts";

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

describe("layerKind", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("names a layout by its direction", () => {
    expect(layerKind(mount('<div style="display:flex"><span></span></div>'))).toBe("flex-row");
    expect(layerKind(mount('<div style="display:flex;flex-direction:column-reverse"><span></span></div>'))).toBe("flex-column");
    expect(layerKind(mount('<ul style="display:grid"><li></li></ul>'))).toBe("grid");
  });

  it("names what a leaf shows", () => {
    expect(layerKind(mount("<p>Hello</p>"))).toBe("text");
    expect(layerKind(mount("<h1>Inspect <em>the</em><br><span>work</span></h1>"))).toBe("text");
    expect(layerKind(mount('<p>Hi <span style="display:block">there</span></p>'))).toBe("box");
    expect(layerKind(mount('<img alt="">'))).toBe("image");
    expect(layerKind(mount("<svg></svg>"))).toBe("vector");
    expect(layerKind(mount("<input>"))).toBe("input");
    expect(layerKind(mount("<button><span>Go</span></button>"))).toBe("button");
    expect(layerKind(mount('<a href="/"><span>Home</span></a>'))).toBe("link");
    expect(layerKind(mount("<div><span></span></div>"))).toBe("box");
  });

  it("prefers the layout over the tag", () => {
    expect(layerKind(mount('<button style="display:inline-flex">Go</button>'))).toBe("flex-row");
  });
});
