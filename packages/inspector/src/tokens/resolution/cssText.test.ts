// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { parseDeclarations, recoverDeclarationsBySelector } from "./cssText.ts";

describe("CSS source-text recovery", () => {
  afterEach(() => {
    document.head.innerHTML = "";
  });

  it("keeps declaration boundaries inside functions, strings, comments, and brackets", () => {
    expect(parseDeclarations(`
      color: var(--ink, rgb(10 20 30 / 50%));
      background-image: url("data:image/svg+xml;utf8,<svg viewBox='0 0 1 1'></svg>");
      --example: "a;b:c"; /* a comment; with punctuation */
      margin: 1px !important;
    `)).toEqual([
      { property: "color", value: "var(--ink, rgb(10 20 30 / 50%))", important: false },
      { property: "background-image", value: "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 1 1'></svg>\")", important: false },
      { property: "--example", value: "\"a;b:c\"", important: false },
      { property: "margin", value: "1px", important: true },
    ]);
  });

  it("recovers authored declarations through nested grouping rules", () => {
    const style = document.createElement("style");
    style.textContent = `
      @media screen {
        @supports (display: grid) {
          .card, .card--feature {
            color: var(--ink, rebeccapurple);
            padding: calc(8px + var(--space));
          }
        }
      }
    `;
    const declarations = recoverDeclarationsBySelector(style.textContent ?? "")
      .get(".card,.card--feature");

    expect(declarations).toEqual([[
      { property: "color", value: "var(--ink, rebeccapurple)", important: false },
      { property: "padding", value: "calc(8px + var(--space))", important: false },
    ]]);
  });
});
