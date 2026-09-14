// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { parseDataSrc } from "../selection/resolveSelection.ts";
import {
  installStaticHtmlRuntimeIdentity,
  isRuntimeCreatedElement,
  isRuntimeGeneratedSource,
  RUNTIME_UNKNOWN_SOURCE_PREFIX,
} from "./staticHtmlRuntimeIdentity.ts";

let dispose: (() => void) | null = null;

afterEach(() => {
  dispose?.();
  dispose = null;
  document.body.innerHTML = "";
});

async function flushMutations(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe("static HTML runtime identity", () => {
  it("assigns deterministic document-local pairs while preserving each existing attribute", () => {
    document.body.innerHTML = [
      '<main data-cid="main" data-src="index.html:1:1"><button id="first">First</button></main>',
      '<button data-cid="author-cid">Second</button>',
      '<button data-src="index.html:4:3">Third</button>',
      '<button data-cid="static" data-src="index.html:5:3">Static</button>',
    ].join("");

    dispose = installStaticHtmlRuntimeIdentity();

    const buttons = Array.from(document.querySelectorAll("button"));
    expect(buttons[0]?.getAttribute("data-cid")).toBe("nudge-ui-runtime-1");
    expect(buttons[0]?.getAttribute("data-src")).toBe(`${RUNTIME_UNKNOWN_SOURCE_PREFIX}1`);
    expect(buttons[1]?.getAttribute("data-cid")).toBe("author-cid");
    expect(buttons[1]?.getAttribute("data-src")).toBe(`${RUNTIME_UNKNOWN_SOURCE_PREFIX}2`);
    expect(buttons[2]?.getAttribute("data-cid")).toBe("nudge-ui-runtime-3");
    expect(buttons[2]?.getAttribute("data-src")).toBe("index.html:4:3");
    expect(buttons[3]?.getAttribute("data-cid")).toBe("static");
    expect(buttons[3]?.getAttribute("data-src")).toBe("index.html:5:3");
    expect(parseDataSrc(buttons[0]?.getAttribute("data-src") ?? "")).toBeNull();
    expect(isRuntimeGeneratedSource(buttons[0]?.getAttribute("data-src"))).toBe(true);
    expect(isRuntimeCreatedElement(buttons[1])).toBe(true);
    expect(isRuntimeCreatedElement(buttons[2])).toBe(true);
    expect(isRuntimeCreatedElement(buttons[3])).toBe(false);
  });

  it("marks observer additions runtime-created when either identity attribute is filled", async () => {
    document.body.innerHTML = "<main data-cid='main' data-src='index.html:1:1'></main>";
    dispose = installStaticHtmlRuntimeIdentity();

    const sourceOnly = document.createElement("button");
    sourceOnly.setAttribute("data-src", "author.html:4:2");
    const cidOnly = document.createElement("a");
    cidOnly.setAttribute("data-cid", "author-link");
    document.body.append(sourceOnly, cidOnly);
    await flushMutations();

    expect(sourceOnly.getAttribute("data-src")).toBe("author.html:4:2");
    expect(sourceOnly.getAttribute("data-cid")).toBe("nudge-ui-runtime-1");
    expect(cidOnly.getAttribute("data-cid")).toBe("author-link");
    expect(cidOnly.getAttribute("data-src")).toBe(`${RUNTIME_UNKNOWN_SOURCE_PREFIX}2`);
    expect(isRuntimeCreatedElement(sourceOnly)).toBe(true);
    expect(isRuntimeCreatedElement(cidOnly)).toBe(true);
  });

  it("skips document structure, excluded subtrees, the mount, SVG, and descendants", () => {
    document.body.innerHTML = [
      "<script><button id='script-child'>Script</button></script>",
      "<style>.x { color: red; }</style>",
      "<template><button id='template-child'>Template</button></template>",
      "<noscript><button id='noscript-child'>No script</button></noscript>",
      "<div id='nudge-ui-root'><button id='mount-child'>Mount</button></div>",
      "<svg><foreignObject><div id='svg-child'>SVG</div></foreignObject></svg>",
      "<article><button id='eligible'>Eligible</button></article>",
    ].join("");

    dispose = installStaticHtmlRuntimeIdentity();

    expect(document.querySelector("#script-child")?.hasAttribute("data-cid") ?? false).toBe(false);
    expect(document.querySelector("#template-child")?.hasAttribute("data-cid") ?? false).toBe(false);
    expect(document.querySelector("#noscript-child")?.hasAttribute("data-cid") ?? false).toBe(false);
    expect(document.querySelector("#mount-child")?.hasAttribute("data-cid") ?? false).toBe(false);
    expect(document.querySelector("#svg-child")?.hasAttribute("data-cid") ?? false).toBe(false);
    expect(document.querySelector("#eligible")?.hasAttribute("data-cid") ?? false).toBe(true);
  });

  it("observes added and replaced subtrees until disposed", async () => {
    document.body.innerHTML = "<main id='content' data-cid='content' data-src='index.html:1:1'><div data-cid='static' data-src='index.html:1:20'></div></main>";
    dispose = installStaticHtmlRuntimeIdentity();

    const content = document.querySelector("#content")!;
    content.replaceChildren(document.createElement("section"));
    await flushMutations();
    const replacement = content.firstElementChild!;
    expect(replacement.getAttribute("data-cid")).toBe("nudge-ui-runtime-1");
    expect(replacement.getAttribute("data-src")).toBe(`${RUNTIME_UNKNOWN_SOURCE_PREFIX}1`);

    dispose();
    const afterDispose = document.createElement("button");
    content.append(afterDispose);
    await flushMutations();
    expect(afterDispose.hasAttribute("data-cid")).toBe(false);
  });
});
