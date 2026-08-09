// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  validateReplaceStyles,
  handleReplaceStyles,
  getLastAppliedRevision,
  resetRendererRevision,
} from "./rendererStylesheet.ts";
import { PROTOCOL_VERSION, setRendererIdentity, type ReplaceStylesMessage } from "./frameProtocol.ts";
import { resetStructuralDeleteProjection } from "../structuralProjection.ts";

const SHEET_ID = "design-tool-styles";
const TEST_PROJECT = "http://localhost:5173";
const TEST_WORKSPACE = "ws-abc-123";
const TEST_CARD_ID = "card-1";

function makeMsg(overrides: Partial<ReplaceStylesMessage> = {}): ReplaceStylesMessage {
  return {
    type: "replace-styles",
    protocolVersion: PROTOCOL_VERSION,
    projectId: TEST_PROJECT,
    workspaceId: TEST_WORKSPACE,
    cardId: TEST_CARD_ID,
    css: ".foo { color: red; }",
    revision: 1,
    instanceOverrides: [],
    structuralChanges: [],
    ...overrides,
  };
}

describe("validateReplaceStyles", () => {
  it("accepts a valid message", () => {
    const result = validateReplaceStyles(makeMsg(), TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);
    expect(result.valid).toBe(true);
  });

  it("rejects non-object messages", () => {
    const result = validateReplaceStyles(null, TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("message is not an object");
  });

  it("rejects string messages", () => {
    const result = validateReplaceStyles("hello", TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);
    expect(result.valid).toBe(false);
  });

  it("rejects wrong protocol version", () => {
    const result = validateReplaceStyles(
      makeMsg({ protocolVersion: 999 }),
      TEST_PROJECT,
      TEST_WORKSPACE,
      TEST_CARD_ID,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("protocol version mismatch");
  });

  it("rejects a v2 stylesheet projection without durable instance targets", () => {
    const legacy = { ...makeMsg(), protocolVersion: 2 };
    delete (legacy as Partial<ReplaceStylesMessage>).instanceOverrides;
    const result = validateReplaceStyles(legacy, TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);
    expect(result).toEqual({ valid: false, reason: "protocol version mismatch" });
  });

  it("rejects wrong message type", () => {
    const msg = { ...makeMsg(), type: "frame-ready" };
    const result = validateReplaceStyles(msg as unknown as ReplaceStylesMessage, TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("not a replace-styles message");
  });

  it("rejects mismatched project ID", () => {
    const result = validateReplaceStyles(
      makeMsg({ projectId: "http://other:9999" }),
      TEST_PROJECT,
      TEST_WORKSPACE,
      TEST_CARD_ID,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("project ID mismatch");
  });

  it("rejects mismatched workspace ID", () => {
    const result = validateReplaceStyles(
      makeMsg({ workspaceId: "other-ws" }),
      TEST_PROJECT,
      TEST_WORKSPACE,
      TEST_CARD_ID,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("workspace ID mismatch");
  });

  it("rejects mismatched card ID", () => {
    const result = validateReplaceStyles(
      makeMsg({ cardId: "card-other" }),
      TEST_PROJECT,
      TEST_WORKSPACE,
      TEST_CARD_ID,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("card ID mismatch");
  });

  it("rejects missing revision", () => {
    const msg = { ...makeMsg() };
    delete (msg as Record<string, unknown>).revision;
    const result = validateReplaceStyles(msg as unknown as ReplaceStylesMessage, TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("revision is not a non-negative safe integer");
  });

  it("rejects non-finite and negative revisions", () => {
    for (const revision of [Number.NaN, Number.POSITIVE_INFINITY, -1, Number.MAX_SAFE_INTEGER + 1]) {
      const result = validateReplaceStyles(
        makeMsg({ revision }),
        TEST_PROJECT,
        TEST_WORKSPACE,
        TEST_CARD_ID,
      );
      expect(result.valid).toBe(false);
    }
  });

  it("rejects missing css", () => {
    const msg = { ...makeMsg() };
    delete (msg as Record<string, unknown>).css;
    const result = validateReplaceStyles(msg as unknown as ReplaceStylesMessage, TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("css is not a string");
  });

  it("rejects a projection without a structural snapshot", () => {
    const msg = { ...makeMsg() } as Partial<ReplaceStylesMessage>;
    delete msg.structuralChanges;
    const result = validateReplaceStyles(msg, TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);
    expect(result).toEqual({ valid: false, reason: "structural changes are invalid" });
  });

  it("rejects physical DOM data in a structural delete", () => {
    const result = validateReplaceStyles(makeMsg({
      structuralChanges: [{
        id: "delete-1",
        kind: "delete",
        target: {
          sourceSite: { cid: "Item", src: "src/App.tsx:5:3" },
          locator: { kind: "evidence", occurrence: 0, props: null, text: "One" },
        },
        placeholder: "never-serialised",
      }] as unknown as ReplaceStylesMessage["structuralChanges"],
    }), TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);
    expect(result).toEqual({ valid: false, reason: "structural changes are invalid" });
  });

  it("rejects physical DOM data in a structural move", () => {
    const result = validateReplaceStyles(makeMsg({
      structuralChanges: [{
        id: "move-1",
        kind: "move",
        target: { sourceSite: { cid: "Item", src: "src/App.tsx:5:3" }, locator: { kind: "evidence", occurrence: 0, props: null, text: "One" } },
        destination: {
          parent: { sourceSite: { cid: "List", src: "src/App.tsx:4:1" }, locator: { kind: "evidence", occurrence: 0, props: null, text: "OneTwo" } },
          before: null,
        },
        node: "never-serialised",
      }] as unknown as ReplaceStylesMessage["structuralChanges"],
    }), TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);
    expect(result).toEqual({ valid: false, reason: "structural changes are invalid" });
  });

  it("rejects a structural move without the durable destination references", () => {
    const result = validateReplaceStyles(makeMsg({
      structuralChanges: [{
        id: "move-1",
        kind: "move",
        target: { sourceSite: { cid: "Item", src: "src/App.tsx:5:3" }, locator: { kind: "evidence", occurrence: 0, props: null, text: "One" } },
      }] as unknown as ReplaceStylesMessage["structuralChanges"],
    }), TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);
    expect(result).toEqual({ valid: false, reason: "structural changes are invalid" });
  });
});

describe("handleReplaceStyles", () => {
  beforeEach(() => {
    resetRendererRevision();
    resetStructuralDeleteProjection();
    document.getElementById(SHEET_ID)?.remove();
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.getElementById(SHEET_ID)?.remove();
  });

  it("applies CSS to the managed stylesheet on first call", () => {
    const applied = handleReplaceStyles(makeMsg({ revision: 1 }), TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);
    expect(applied).toBe(true);

    const el = document.getElementById(SHEET_ID) as HTMLStyleElement | null;
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain(".foo { color: red; }");
    expect(getLastAppliedRevision()).toBe(1);
  });

  it("creates the stylesheet element if it does not exist", () => {
    expect(document.getElementById(SHEET_ID)).toBeNull();

    handleReplaceStyles(makeMsg({ revision: 1 }), TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);

    const el = document.getElementById(SHEET_ID) as HTMLStyleElement | null;
    expect(el).not.toBeNull();
    expect(el!.getAttribute("data-design-tool")).toBe("managed");
  });

  it("resolves durable instance targets before applying their managed CSS", () => {
    document.body.innerHTML = `
      <button data-cid="Item" data-src="src/App.tsx:5:3">One</button>
      <button data-cid="Item" data-src="src/App.tsx:5:3">Two</button>`;
    const applied = handleReplaceStyles(makeMsg({
      css: '[data-cid="Item"][data-src="src/App.tsx:5:3"][data-dt-projection-instance="override-1"] { color: blue; }',
      instanceOverrides: [{
        id: "override-1",
        target: {
          sourceSite: { cid: "Item", src: "src/App.tsx:5:3" },
          locator: { kind: "evidence", occurrence: 1, props: null, text: "Two" },
        },
      }],
    }), TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);

    expect(applied).toBe(true);
    expect(document.querySelectorAll('[data-dt-projection-instance="override-1"]')).toHaveLength(1);
    expect(document.querySelector('[data-dt-projection-instance="override-1"]')?.textContent).toBe("Two");
  });

  it("resolves each structural delete in this renderer without broadening a repeated source site", () => {
    document.body.innerHTML = `
      <button data-cid="Item" data-src="src/App.tsx:5:3">One</button>
      <button data-cid="Item" data-src="src/App.tsx:5:3">Two</button>`;

    const applied = handleReplaceStyles(makeMsg({
      structuralChanges: [{
        id: "delete-2",
        kind: "delete",
        target: {
          sourceSite: { cid: "Item", src: "src/App.tsx:5:3" },
          locator: { kind: "evidence", occurrence: 1, props: null, text: "Two" },
        },
      }],
    }), TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);

    expect(applied).toBe(true);
    expect(document.body.textContent).toContain("One");
    expect(document.body.textContent).not.toContain("Two");
  });

  it("reports application and a later overridden delete without reapplying it", async () => {
    const postMessage = vi.spyOn(window.parent, "postMessage");
    setRendererIdentity({ projectId: TEST_PROJECT, workspaceId: TEST_WORKSPACE, cardId: TEST_CARD_ID });
    document.body.innerHTML = '<button data-cid="Item" data-src="src/App.tsx:5:3">Two</button>';

    handleReplaceStyles(makeMsg({
      revision: 7,
      structuralChanges: [{
        id: "delete-2",
        kind: "delete",
        target: {
          sourceSite: { cid: "Item", src: "src/App.tsx:5:3" },
          locator: { kind: "evidence", occurrence: 0, props: null, text: "Two" },
        },
      }],
    }), TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "structural-projection-report",
      revision: 7,
      reports: [{ changeId: "delete-2", status: "applied" }],
    }), window.location.origin);

    const placeholder = Array.from(document.body.childNodes).find((node) => node.nodeType === node.COMMENT_NODE)!;
    const replacement = document.createElement("button");
    replacement.textContent = "Application replacement";
    placeholder.replaceWith(replacement);
    await Promise.resolve();

    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "structural-projection-report",
      revision: 7,
      reports: [{ changeId: "delete-2", status: "overridden" }],
    }), window.location.origin);
    expect(document.body.textContent).toContain("Application replacement");
    postMessage.mockRestore();
  });

  it("resolves a structural move locally using only durable target and anchor references", () => {
    document.body.innerHTML = `
      <section data-cid="List" data-src="src/App.tsx:4:1">
        <button data-cid="Item" data-src="src/App.tsx:5:3">One</button>
        <button data-cid="Item" data-src="src/App.tsx:5:3">Two</button>
        <button data-cid="Item" data-src="src/App.tsx:5:3">Three</button>
      </section>`;

    const applied = handleReplaceStyles(makeMsg({
      structuralChanges: [{
        id: "move-2",
        kind: "move",
        target: {
          sourceSite: { cid: "Item", src: "src/App.tsx:5:3" },
          locator: { kind: "evidence", occurrence: 1, props: null, text: "Two" },
        },
        destination: {
          parent: {
            sourceSite: { cid: "List", src: "src/App.tsx:4:1" },
            locator: { kind: "evidence", occurrence: 0, props: null, text: "One Two Three" },
          },
          before: {
            sourceSite: { cid: "Item", src: "src/App.tsx:5:3" },
            locator: { kind: "evidence", occurrence: 0, props: null, text: "One" },
          },
        },
      }],
    }), TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);

    expect(applied).toBe(true);
    expect(Array.from(document.querySelector("section")!.children).map((element) => element.textContent))
      .toEqual(["Two", "One", "Three"]);
  });

  it("accepts a delete-only revision after an already-ready renderer accepted empty CSS", () => {
    document.body.innerHTML = `
      <button data-cid="Item" data-src="src/App.tsx:5:3">One</button>
      <button data-cid="Item" data-src="src/App.tsx:5:3">Two</button>`;

    expect(handleReplaceStyles(makeMsg({ css: "", revision: 1 }), TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID))
      .toBe(true);
    expect(handleReplaceStyles(makeMsg({
      css: "",
      revision: 2,
      structuralChanges: [{
        id: "delete-2",
        kind: "delete",
        target: {
          sourceSite: { cid: "Item", src: "src/App.tsx:5:3" },
          locator: { kind: "evidence", occurrence: 1, props: null, text: "Two" },
        },
      }],
    }), TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID)).toBe(true);

    expect(document.body.textContent).toContain("One");
    expect(document.body.textContent).not.toContain("Two");
    expect(getLastAppliedRevision()).toBe(2);
  });

  it("applies CSS for a newer revision", () => {
    handleReplaceStyles(
      makeMsg({ revision: 1, css: ".a { color: red; }" }),
      TEST_PROJECT,
      TEST_WORKSPACE,
      TEST_CARD_ID,
    );

    const applied = handleReplaceStyles(
      makeMsg({ revision: 2, css: ".b { color: blue; }" }),
      TEST_PROJECT,
      TEST_WORKSPACE,
      TEST_CARD_ID,
    );

    expect(applied).toBe(true);
    const el = document.getElementById(SHEET_ID) as HTMLStyleElement;
    expect(el.textContent).toContain(".b { color: blue; }");
    expect(el.textContent).not.toContain(".a { color: red; }");
  });

  it("rejects an older or equal revision", () => {
    handleReplaceStyles(makeMsg({ revision: 5 }), TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);

    const applied = handleReplaceStyles(makeMsg({ revision: 3 }), TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);
    expect(applied).toBe(false);
  });

  it("rejects same revision", () => {
    handleReplaceStyles(makeMsg({ revision: 5 }), TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);

    const applied = handleReplaceStyles(makeMsg({ revision: 5 }), TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);
    expect(applied).toBe(false);
  });

  it("returns false on invalid message", () => {
    const applied = handleReplaceStyles(
      makeMsg({ projectId: "http://wrong" }),
      TEST_PROJECT,
      TEST_WORKSPACE,
      TEST_CARD_ID,
    );
    expect(applied).toBe(false);
  });

  it("overwrites all previous rules on each call", () => {
    handleReplaceStyles(
      makeMsg({ revision: 1, css: ".a { color: red; } .b { margin: 0; }" }),
      TEST_PROJECT,
      TEST_WORKSPACE,
      TEST_CARD_ID,
    );

    const el = document.getElementById(SHEET_ID) as HTMLStyleElement;
    expect(el.textContent).toContain(".a { color: red; }");
    expect(el.textContent).toContain(".b { margin: 0; }");

    handleReplaceStyles(
      makeMsg({ revision: 2, css: ".c { padding: 10px; }" }),
      TEST_PROJECT,
      TEST_WORKSPACE,
      TEST_CARD_ID,
    );

    expect(el.textContent).toContain(".c { padding: 10px; }");
    expect(el.textContent).not.toContain(".a");
    expect(el.textContent).not.toContain(".b");
  });

  it("handles empty CSS cleanly", () => {
    handleReplaceStyles(
      makeMsg({ revision: 1, css: ".a { color: red; }" }),
      TEST_PROJECT,
      TEST_WORKSPACE,
      TEST_CARD_ID,
    );

    handleReplaceStyles(
      makeMsg({ revision: 2, css: "" }),
      TEST_PROJECT,
      TEST_WORKSPACE,
      TEST_CARD_ID,
    );

    const el = document.getElementById(SHEET_ID) as HTMLStyleElement;
    expect(el.textContent).toBe("");
  });
});
