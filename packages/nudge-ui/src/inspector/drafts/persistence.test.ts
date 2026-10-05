// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { clearActiveDraft, getChangesList, appendChange } from "../changes/changesLog.ts";
import type { ComponentChangeRecord, ElementChangeRecord, TextContentChangeRecord, TokenChangeRecord } from "../changes/changesLog.ts";
import { makeComponentChange as makeComponentChangeRecord } from "../changes/_testUtils.ts";
import { activateDraftForCard, loadDrafts, persistDrafts, resetDrafts } from "./store.ts";
import { hydrateCanvasStore } from "../canvas/canvasStore.ts";
import { nudgeUiProjectId } from "virtual:design-tokens";
import {
  createStructuralDelete,
  createStructuralMove,
} from "../projection/structuralProjection.ts";
import type { TokenEntry } from "../../css/model/index.ts";

const COLOR_A: TokenEntry = { name: "--color-a", value: "#aaaaaa", source: "styles.css:1" };
const COLOR_B: TokenEntry = { name: "--color-b", value: "#bbbbbb", source: "styles.css:2" };

function makeElementChange(
  overrides: Partial<ElementChangeRecord> = {},
): ElementChangeRecord {
  return {
    cid: "Button",
    file: "src/Button.tsx",
    line: 1,
    selector: '[data-cid="Button"][data-src*="src/Button.tsx:1"]',
    property: "background",
    oldToken: COLOR_A,
    newToken: COLOR_B,
    source: { file: "src/Button.tsx", line: 1, component: "Button" },
    ...overrides,
  };
}

function makeTokenChange(
  overrides: Partial<TokenChangeRecord> = {},
): TokenChangeRecord {
  return {
    kind: "token",
    tokenName: "--color-surface-raised",
    file: "src/theme.css",
    line: 6,
    selector: ':root[data-theme="dark"]',
    property: "--color-surface-raised",
    rawValue: "#abcdef",
    oldRawValue: "#00ff00",
    context: { wrappers: [{ kind: "media", params: "(prefers-color-scheme: dark)" }] },
    contextLabel: 'root[data-theme="dark"]',
    source: { file: "src/theme.css", line: 6, component: "Global token" },
    ...overrides,
    important: overrides.important ?? false,
  };
}

function makeComponentChange(): ComponentChangeRecord {
  return makeComponentChangeRecord();
}

function makeTextChange(overrides: Partial<TextContentChangeRecord> = {}): TextContentChangeRecord {
  return {
    kind: "text-content",
    id: "text-1",
    target: {
      sourceSite: { cid: "Copy", src: "src/Copy.tsx:8:3" },
      occurrence: 0,
      props: "tone:muted",
      ariaLabel: null,
      beforeText: "Original",
    },
    source: { file: "src/Copy.tsx", line: 8, column: 3, component: "Copy" },
    selector: '[data-cid="Copy"][data-src*="src/Copy.tsx:8:3"]',
    before: "Original",
    after: "Updated",
    authoredAs: "literal",
    ...overrides,
  };
}

const historyKey = `nudge-ui-drafts:${nudgeUiProjectId}:v2`;
function openDraft(): void {
  loadDrafts(nudgeUiProjectId);
  activateDraftForCard("record-card");
}
function saveDraft(): void {
  persistDrafts();
}
function storedContents() {
  persistDrafts();
  return JSON.parse(localStorage.getItem(historyKey)!).drafts[0].contents;
}
function reloadDraft(): void {
  persistDrafts();
  resetDrafts();
  clearActiveDraft();
  openDraft();
}
beforeEach(() => {
  resetDrafts(); clearActiveDraft(); localStorage.clear(); document.body.replaceChildren();
  hydrateCanvasStore("canvas", [{ id: "record-card", content: { kind: "route", url: window.location.href }, title: null, x: 0, y: 0, width: 100, height: 100 }], { x: 0, y: 0, zoom: 1 });
  openDraft();
});
afterEach(() => { resetDrafts(); clearActiveDraft(); document.body.replaceChildren(); });

describe("draft intent persistence", () => {
  it("serializes a durable rendered-instance change", () => {
    appendChange(makeElementChange({
      scope: "rendered-instance",
      instanceOverride: {
        id: "override-1",
        target: {
          sourceSite: { cid: "Button", src: "src/Button.tsx:1:1" },
          locator: { kind: "evidence", occurrence: 1, props: null, text: "Two" },
        },
      },
    }));
    saveDraft();

    persistDrafts();
    const raw = localStorage.getItem(historyKey);
    expect(raw).not.toBeNull();
    const parsed = storedContents();
    expect(parsed.changes).toHaveLength(1);
    expect(parsed.changes[0]).toMatchObject({
      scope: "rendered-instance",
      instanceOverride: { id: "override-1", target: { locator: { occurrence: 1, text: "Two" } } },
    });
  });

  it("serializes and hydrates a durable rendered-text change", () => {
    const element = document.createElement("p");
    element.dataset.cid = "Copy";
    element.dataset.src = "src/Copy.tsx:8:3";
    element.dataset.cprops = "tone:muted";
    element.textContent = "Original";
    document.body.append(element);

    appendChange(makeTextChange());
    saveDraft();
    const parsed = storedContents();
    expect(parsed.changes[0]).toMatchObject({
      kind: "text-content",
      target: { sourceSite: { cid: "Copy", src: "src/Copy.tsx:8:3" }, beforeText: "Original" },
      before: "Original",
      after: "Updated",
    });

    resetDrafts();
    clearActiveDraft();
    document.body.replaceChildren(element);
    reloadDraft();
    expect(getChangesList()).toMatchObject([{ kind: "text-content", after: "Updated" }]);
    expect(element.textContent).toBe("Updated");
  });

  it("round-trips the exact text-node path for mixed Canvas projections", () => {
    const element = document.createElement("button");
    element.dataset.cid = "Copy";
    element.dataset.src = "src/Copy.tsx:8:3";
    element.dataset.cprops = "tone:muted";
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.innerHTML = "<path d=\"M0 0h4v4H0z\" />";
    const label = document.createElement("span");
    label.textContent = "Original";
    element.append(icon, label);
    document.body.append(element);

    appendChange(makeTextChange({
      target: {
        ...makeTextChange().target,
        textNodePath: [1, 0],
      },
    }));
    saveDraft();
    const parsed = storedContents();
    expect(parsed.changes[0].target.textNodePath).toEqual([1, 0]);

    resetDrafts();
    clearActiveDraft();
    document.body.replaceChildren(element);
    reloadDraft();
    expect(element.querySelector("path")).not.toBeNull();
    expect(element.querySelector("span")?.textContent).toBe("Updated");
    expect(getChangesList()[0]).toMatchObject({ target: { textNodePath: [1, 0] } });
  });

  it("serializes canonical structural deletes and moves without document-local artefacts", () => {
    const parent = document.createElement("section");
    parent.dataset.cid = "List";
    parent.dataset.src = "src/List.tsx:4:1";
    const first = document.createElement("button");
    first.dataset.cid = "Item";
    first.dataset.src = "src/List.tsx:8:1";
    first.textContent = "First";
    const second = first.cloneNode(true) as HTMLElement;
    second.textContent = "Second";
    const third = first.cloneNode(true) as HTMLElement;
    third.textContent = "Third";
    parent.append(first, second, third);
    document.body.append(parent);
    createStructuralDelete(second, "delete-1");
    createStructuralMove(first, { parent, before: null }, "move-1");

    saveDraft();
    const json = JSON.stringify(storedContents());
    expect(json).toContain('"structuralChanges"');
    expect(json).toContain('"kind":"delete"');
    expect(json).toContain('"kind":"move"');
    expect(json).not.toContain("nudge-ui-deleted");
    expect(json).not.toContain("placeholder");
    expect(json).not.toContain("elementId");
  });

  it("serializes token changes without element identity fields", () => {
    appendChange(makeTokenChange());
    saveDraft();

    persistDrafts();
    const raw = localStorage.getItem(historyKey);
    const parsed = storedContents();
    expect(parsed.changes).toHaveLength(1);
    expect(parsed.changes[0].kind).toBe("token");
    expect(parsed.changes[0].rawValue).toBe("#abcdef");
    expect(parsed.changes[0].oldRawValue).toBe("#00ff00");
  });

  it("serializes canonical intent without preview diagnostics", () => {
    // Guard against re-introducing transient preview state on the durable
    // record: ElementChangeRecord has no previewResult field, so this can only
    // fail if preview diagnostics leak back into canonical intent.
    appendChange(makeElementChange());
    saveDraft();
    const session = storedContents();
    const json = JSON.stringify(session);
    expect(json).not.toContain("previewResult");
    expect(json).not.toContain("computedValue");
  });

  it("full round-trip preserves element changes", () => {
    appendChange(makeElementChange());
    appendChange(makeElementChange({
      property: "color",
      newToken: null,
      oldToken: null,
      rawValue: "red",
    }));
    saveDraft();

    resetDrafts();
    clearActiveDraft();
    reloadDraft();

    const restored = getChangesList();
    expect(restored).toHaveLength(2);
    expect(restored[0]!.property).toBe("background");
    expect(restored[1]!.property).toBe("color");
    expect((restored[1] as ElementChangeRecord).rawValue).toBe("red");
  });

  it("full round-trip preserves standalone source columns and runtime evidence", () => {
    appendChange(makeElementChange({
      cid: "nudge-ui-runtime-1",
      file: "",
      line: 0,
      column: 0,
      selector: '[data-cid="nudge-ui-runtime-1"][data-src="nudge-ui:unknown:1"]',
      source: { file: "", line: 0, component: "nudge-ui-runtime-1" },
      runtimeEvidence: {
        tagName: "button",
        text: "Save",
        props: null,
        ariaLabel: "Save changes",
      },
    }));
    saveDraft();

    resetDrafts();
    clearActiveDraft();
    reloadDraft();

    expect(getChangesList()).toMatchObject([{
      column: 0,
      runtimeEvidence: {
        tagName: "button",
        text: "Save",
        props: null,
        ariaLabel: "Save changes",
      },
    }]);
  });

  it("full round-trip preserves token changes", () => {
    appendChange(makeTokenChange());
    saveDraft();

    resetDrafts();
    clearActiveDraft();
    reloadDraft();

    const restored = getChangesList();
    expect(restored).toHaveLength(1);
    expect(restored[0]!.kind).toBe("token");
    if (restored[0]!.kind === "token") {
      expect((restored[0] as TokenChangeRecord).rawValue).toBe("#abcdef");
    }
  });

  it("full round-trip preserves typed component prop changes", () => {
    appendChange(makeComponentChange());
    saveDraft();

    resetDrafts();
    clearActiveDraft();
    reloadDraft();

    expect(getChangesList()).toMatchObject([{
      kind: "component-prop",
      target: { componentId: "src/ui/Button#Button" },
      before: { kind: "value", value: "primary" },
      after: "secondary",
      authoredAs: "literal",
    }]);
  });
});
