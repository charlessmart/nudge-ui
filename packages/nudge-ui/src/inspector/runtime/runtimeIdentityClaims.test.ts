// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { ElementChangeRecord } from "../changes/types.ts";
import type { TextContentChangeRecord } from "../changes/editModel.ts";
import {
  applyRuntimeIdentityClaims,
  collectRuntimeIdentityClaims,
  type RuntimeIdentityClaim,
} from "./runtimeIdentityClaims.ts";
import { installLazyRuntimeIdentity, normalizeRuntimeText, runtimeDomPath } from "./staticHtmlRuntimeIdentity.ts";

const PAGE = [
  "<main class=\"hero\"><h1 class=\"title\">Charles Smart.</h1>",
  "<p class=\"intro\">From dragging prototyping noodles</p>",
  "<p class=\"intro\">Currently designing AI tools</p></main>",
].join("");

function claimFor(element: HTMLElement, cid: string, src: string | null): RuntimeIdentityClaim {
  return {
    cid,
    src,
    tagName: element.tagName.toLowerCase(),
    text: normalizeRuntimeText(element.textContent),
    props: null,
    ariaLabel: null,
    domPath: runtimeDomPath(element),
    elementId: null,
  };
}

/** Captures claims on one page load, then simulates a reload of the same markup. */
function claimsAfterReload(select: (doc: Document) => HTMLElement, cid = "nudge-ui-runtime-7"): RuntimeIdentityClaim[] {
  document.body.innerHTML = PAGE;
  const claims = [claimFor(select(document), cid, "nudge-ui:unknown:7")];
  document.body.innerHTML = PAGE;
  return claims;
}

const flushMutations = () => new Promise((resolve) => setTimeout(resolve, 0));

let dispose: (() => void) | undefined;
afterEach(() => {
  applyRuntimeIdentityClaims(document, []);
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
});

describe("runtime identity claims", () => {
  it("re-attaches a saved identity to its element after a reload", () => {
    const heading = (doc: Document) => doc.querySelector<HTMLElement>("h1")!;
    applyRuntimeIdentityClaims(document, claimsAfterReload(heading));

    expect(heading(document).getAttribute("data-cid")).toBe("nudge-ui-runtime-7");
    expect(heading(document).getAttribute("data-src")).toBe("nudge-ui:unknown:7");
  });

  it("never hands a saved identity to whichever element is hovered first", () => {
    const second = (doc: Document) => doc.querySelectorAll<HTMLElement>("p")[1]!;
    const claims = claimsAfterReload(second, "nudge-ui-runtime-1");
    dispose = installLazyRuntimeIdentity();
    // Hovering tags the heading, its ancestors, and its siblings before the saved edits arrive.
    document.querySelector("h1")!.dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(document.querySelector('[data-cid="nudge-ui-runtime-1"]')).toBeNull();

    applyRuntimeIdentityClaims(document, claims);

    expect(document.querySelectorAll('[data-cid="nudge-ui-runtime-1"]')).toHaveLength(1);
    expect(second(document).getAttribute("data-cid")).toBe("nudge-ui-runtime-1");
  });

  it("leaves a claim unattached when several elements match its evidence", () => {
    document.body.innerHTML = "<ul><li>Item</li><li>Item</li></ul>";
    const claim = claimFor(document.querySelector("li")!, "nudge-ui-runtime-3", null);

    applyRuntimeIdentityClaims(document, [claim]);

    expect(document.querySelector("[data-cid]")).toBeNull();
  });

  it("does not take an element that already has authored identity", () => {
    const heading = (doc: Document) => doc.querySelector<HTMLElement>("h1")!;
    const claims = claimsAfterReload(heading);
    heading(document).setAttribute("data-cid", "Heading");

    applyRuntimeIdentityClaims(document, claims);

    expect(heading(document).getAttribute("data-cid")).toBe("Heading");
  });

  it("re-attaches when the page replaces the element, as hydration does", async () => {
    const heading = (doc: Document) => doc.querySelector<HTMLElement>("h1")!;
    applyRuntimeIdentityClaims(document, claimsAfterReload(heading));
    expect(heading(document).hasAttribute("data-cid")).toBe(true);

    document.body.innerHTML = PAGE;
    await flushMutations();

    expect(heading(document).getAttribute("data-cid")).toBe("nudge-ui-runtime-7");
  });

  it("leaves conflicting text unattached even when the DOM path is unique", () => {
    document.body.innerHTML = "<footer><time class=\"clock\">It's 1:18pm</time></footer>";
    const claim = claimFor(document.querySelector("time")!, "nudge-ui-runtime-4", null);
    document.querySelector("time")!.textContent = "It's 1:19pm";

    applyRuntimeIdentityClaims(document, [claim]);

    expect(document.querySelector("time")!.getAttribute("data-cid")).toBeNull();
  });

  it("collects claims from saved style and text edits", () => {
    const style: ElementChangeRecord = {
      cid: "nudge-ui-runtime-7",
      file: "",
      line: 0,
      selector: '[data-cid="nudge-ui-runtime-7"][data-src="nudge-ui:unknown:7"]',
      property: "font-weight",
      oldToken: null,
      newToken: null,
      rawValue: "700",
      source: { file: "", line: 0, component: "" },
      runtimeEvidence: { reason: "unannotated", tagName: "h1", text: "Renamed", props: null, ariaLabel: null, domPath: "main.hero > h1.title", elementId: null },
    };
    const text: TextContentChangeRecord = {
      kind: "text-content",
      id: "text-1",
      target: {
        sourceSite: { cid: "nudge-ui-runtime-7", src: "nudge-ui:unknown:7" },
        occurrence: 0,
        props: null,
        ariaLabel: null,
        beforeText: "Charles  Smart.",
        tagName: "h1",
      },
      source: { file: "page.html", line: 1, column: 1, component: "" },
      selector: '[data-cid="nudge-ui-runtime-7"]',
      before: "Charles  Smart.",
      after: "Renamed",
      authoredAs: "literal",
    };
    const authored: ElementChangeRecord = { ...style, cid: "Heading", selector: '[data-cid="Heading"]' };

    expect(collectRuntimeIdentityClaims({ changes: [style, text, authored], structuralChanges: [] })).toEqual([{
      cid: "nudge-ui-runtime-7",
      src: "nudge-ui:unknown:7",
      tagName: "h1",
      // The page renders the pre-edit text, not the text captured after the preview.
      text: "Charles Smart.",
      props: null,
      ariaLabel: null,
      domPath: "main.hero > h1.title",
      elementId: null,
    }]);
  });
});
