// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { evaluate as evaluateUnified } from "@mdx-js/mdx";
import { mdxToJs } from "satteri";
import type { Root } from "hast";
import { run } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMarkdownIdentityPlugin, createSatteriIdentityPlugin } from "./markdownIdentity.ts";
import { instrumentRenderedHtml } from "../../html/identity.ts";
import {
  applyTextContentProjection,
  captureTextProjectionTarget,
  resetTextProjectionState,
} from "../../inspector/projection/textProjection.ts";
import type { TextContentChangeRecord } from "../../inspector/changes/editModel.ts";

const source = "# Case study\n\nRepeated prose.\n\nRepeated prose.\n\nExplore the [process](/process) with **care**.";

it("preserves earlier plugin identities and skips elements without authored positions", async () => {
  function earlierPlugin() {
    return (tree: Root): void => {
      for (const node of tree.children) {
        if (node.type !== "element") continue;
        if (node.tagName === "h1") delete node.position;
        if (node.tagName === "p") {
          node.properties["data-cid"] = "ExistingCopy";
          node.properties["data-src"] = "src/original.mdx:12:5";
        }
      }
    };
  }
  const module = await evaluateUnified({
    value: "# Generated heading\n\nExisting paragraph.", path: "/project/src/case.mdx",
  }, { ...runtime, rehypePlugins: [earlierPlugin, createMarkdownIdentityPlugin("/project")] });
  const html = renderToStaticMarkup(createElement(module.default));
  expect(html).toContain("<h1>Generated heading</h1>");
  expect(html).toContain('data-cid="ExistingCopy"');
  expect(html).toContain('data-src="src/original.mdx:12:5"');
});

describe.each(["unified", "satteri"] as const)("%s Markdown identity", (processor) => {
  afterEach(() => {
    resetTextProjectionState();
    document.body.replaceChildren();
  });

  async function render(): Promise<string> {
    const module = processor === "unified"
      ? await evaluateUnified({ value: source, path: "/project/src/content/case.mdx" }, {
        ...runtime, rehypePlugins: [createMarkdownIdentityPlugin("/project")],
      })
      : await run((await mdxToJs(source, {
        outputFormat: "function-body", fileURL: new URL("file:///project/src/content/case.mdx"),
        hastPlugins: [createSatteriIdentityPlugin("/project")],
      })).code, runtime);
    return renderToStaticMarkup(createElement(module.default as ComponentType));
  }

  it("preserves authored locations through the Astro response pass and distinguishes identical prose", async () => {
    const html = await render();
    document.body.innerHTML = instrumentRenderedHtml(`<html><body>${html}</body></html>`).html;
    expect(document.querySelector("h1")?.getAttribute("data-src")).toBe("src/content/case.mdx:1:1");
    const paragraphs = document.querySelectorAll("p");
    expect(paragraphs[0]?.getAttribute("data-src")).toBe("src/content/case.mdx:3:1");
    expect(paragraphs[1]?.getAttribute("data-src")).toBe("src/content/case.mdx:5:1");
    expect(document.querySelector("a")?.getAttribute("data-src")).toBe("src/content/case.mdx:7:13");

    const target = captureTextProjectionTarget(paragraphs[1]!);
    expect(target).not.toBeNull();
    const change: TextContentChangeRecord = {
      kind: "text-content", id: "mdx-copy", target: target!,
      source: { file: "src/content/case.mdx", line: 5, column: 1, component: "astro:P" },
      selector: '[data-src="src/content/case.mdx:5:1"]',
      before: "Repeated prose.", after: "Updated prose.", authoredAs: "unknown",
    };
    expect(applyTextContentProjection(document, [change])).toEqual([{ changeId: "mdx-copy", status: "applied" }]);
    expect(paragraphs[0]?.textContent).toBe("Repeated prose.");
    expect(paragraphs[1]?.textContent).toBe("Updated prose.");
    applyTextContentProjection(document, []);
    expect(paragraphs[1]?.textContent).toBe("Repeated prose.");
  });

  it("edits inline emphasis without flattening the surrounding prose or link", async () => {
    document.body.innerHTML = await render();
    const paragraph = document.querySelectorAll("p")[2]!;
    const emphasis = paragraph.querySelector("strong")!;
    const target = captureTextProjectionTarget(emphasis)!;
    expect(target).not.toBeNull();
    const change: TextContentChangeRecord = {
      kind: "text-content", id: "mdx-inline", target,
      source: { file: "src/content/case.mdx", line: 7, column: 1, component: "astro:P" },
      selector: '[data-cid="astro:Strong"]',
      before: "care", after: "iteration", authoredAs: "unknown",
    };
    applyTextContentProjection(document, [change]);
    expect(paragraph.textContent).toBe("Explore the process with iteration.");
    expect(paragraph.querySelector("a")?.getAttribute("href")).toBe("/process");
    expect(paragraph.querySelector("strong")?.textContent).toBe("iteration");
    applyTextContentProjection(document, []);
    expect(paragraph.textContent).toBe("Explore the process with care.");
  });
});
