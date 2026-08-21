// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { parseDataSrc } from "./resolveSelection.ts";
import {
  installStaticHtmlRuntimeIdentity,
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
    expect(buttons[0]?.getAttribute("data-cid")).toBe("design-tool-runtime-1");
    expect(buttons[0]?.getAttribute("data-src")).toBe(`${RUNTIME_UNKNOWN_SOURCE_PREFIX}1`);
    expect(buttons[1]?.getAttribute("data-cid")).toBe("author-cid");
    expect(buttons[1]?.getAttribute("data-src")).toBe(`${RUNTIME_UNKNOWN_SOURCE_PREFIX}2`);
    expect(buttons[2]?.getAttribute("data-cid")).toBe("design-tool-runtime-3");
    expect(buttons[2]?.getAttribute("data-src")).toBe("index.html:4:3");
    expect(buttons[3]?.getAttribute("data-cid")).toBe("static");
    expect(buttons[3]?.getAttribute("data-src")).toBe("index.html:5:3");
    expect(parseDataSrc(buttons[0]?.getAttribute("data-src") ?? "")).toBeNull();
    expect(isRuntimeGeneratedSource(buttons[0]?.getAttribute("data-src"))).toBe(true);
  });

  it("skips document structure, excluded subtrees, the mount, SVG, and descendants", () => {
    document.body.innerHTML = [
      "<script><button id='script-child'>Script</button></script>",
      "<style>.x { color: red; }</style>",
      "<template><button id='template-child'>Template</button></template>",
      "<noscript><button id='noscript-child'>No script</button></noscript>",
      "<div id='design-tool-root'><button id='mount-child'>Mount</button></div>",
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
    expect(replacement.getAttribute("data-cid")).toBe("design-tool-runtime-1");
    expect(replacement.getAttribute("data-src")).toBe(`${RUNTIME_UNKNOWN_SOURCE_PREFIX}1`);

    dispose();
    const afterDispose = document.createElement("button");
    content.append(afterDispose);
    await flushMutations();
    expect(afterDispose.hasAttribute("data-cid")).toBe(false);
  });
});
