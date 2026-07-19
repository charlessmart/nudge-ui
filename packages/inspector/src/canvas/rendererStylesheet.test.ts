// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  validateReplaceStyles,
  handleReplaceStyles,
  getLastAppliedRevision,
  resetRendererRevision,
} from "./rendererStylesheet.ts";
import { PROTOCOL_VERSION, type ReplaceStylesMessage } from "./frameProtocol.ts";

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
    if (!result.valid) expect(result.reason).toBe("revision is not a number");
  });

  it("rejects missing css", () => {
    const msg = { ...makeMsg() };
    delete (msg as Record<string, unknown>).css;
    const result = validateReplaceStyles(msg as unknown as ReplaceStylesMessage, TEST_PROJECT, TEST_WORKSPACE, TEST_CARD_ID);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("css is not a string");
  });
});

describe("handleReplaceStyles", () => {
  beforeEach(() => {
    resetRendererRevision();
    document.getElementById(SHEET_ID)?.remove();
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
