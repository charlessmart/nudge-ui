// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  appendChange,
  clearWorkspace,
  getChangesList,
} from "../changes/changesLog.ts";
import { changeKey } from "../changes/model.ts";
import { getPreviewDiagnostic } from "../changes/previewDiagnostics.ts";
import type { TokenEntry } from "../../css/model/index.ts";
import {
  isOriginalPreviewActive,
  setOriginalPreviewActive,
} from "./originalPreview.ts";

function makeRecord(property: string, rawValue: string) {
  return {
    cid: "Button",
    file: "src/Button.tsx",
    line: 1,
    selector: '[data-cid="Button"]',
    property,
    oldToken: null,
    newToken: null,
    rawValue,
    source: { file: "src/Button.tsx", line: 1, component: "Button" },
  };
}

function sheetText(): string {
  return document.getElementById("nudge-ui-styles")?.textContent ?? "";
}

const COLOR_A: TokenEntry = { name: "--color-a", value: "#aaaaaa", source: "styles.css:1" };
const COLOR_B: TokenEntry = { name: "--color-b", value: "#bbbbbb", source: "styles.css:2" };

function makeTokenRecord() {
  return {
    cid: "Button",
    file: "src/Button.tsx",
    line: 1,
    selector: '[data-cid="Button"]',
    property: "background",
    oldToken: COLOR_A,
    newToken: COLOR_B,
    source: { file: "src/Button.tsx", line: 1, component: "Button" },
  };
}

describe("originalPreview", () => {
  beforeEach(() => {
    clearWorkspace();
    setOriginalPreviewActive(false);
    document.getElementById("nudge-ui-styles")?.remove();
  });

  afterEach(() => {
    setOriginalPreviewActive(false);
    clearWorkspace();
    document.getElementById("nudge-ui-styles")?.remove();
  });

  it("suspends managed styles while held and restores them on release", () => {
    expect(appendChange(makeRecord("color", "red"))).toBe("applied");
    expect(sheetText()).toContain("red");

    setOriginalPreviewActive(true);
    expect(isOriginalPreviewActive()).toBe(true);
    expect(sheetText()).toBe("");
    expect(getChangesList()).toHaveLength(1);

    setOriginalPreviewActive(false);
    expect(isOriginalPreviewActive()).toBe(false);
    expect(sheetText()).toContain("red");
    expect(getChangesList()).toHaveLength(1);
  });

  it("keeps commits made while peeking and applies them on release", () => {
    expect(appendChange(makeRecord("color", "red"))).toBe("applied");
    setOriginalPreviewActive(true);
    expect(appendChange(makeRecord("background", "blue"))).toBe("applied");
    expect(sheetText()).toBe("");

    setOriginalPreviewActive(false);
    expect(sheetText()).toContain("red");
    expect(sheetText()).toContain("blue");
    expect(getChangesList()).toHaveLength(2);
  });

  it("ignores repeated toggles to the same state", () => {
    expect(appendChange(makeRecord("color", "red"))).toBe("applied");
    setOriginalPreviewActive(true);
    setOriginalPreviewActive(true);
    expect(sheetText()).toBe("");
    setOriginalPreviewActive(false);
    setOriginalPreviewActive(false);
    expect(sheetText()).toContain("red");
  });

  it("re-verifies after release when a flush ran during the hold", async () => {
    const btn = document.createElement("button");
    btn.setAttribute("data-cid", "Button");
    btn.setAttribute("data-src", "src/Button.tsx:1:1");
    document.body.appendChild(btn);
    try {
      expect(appendChange(makeTokenRecord())).toBe("applied");
      const key = changeKey(getChangesList()[0]!);
      setOriginalPreviewActive(true);
      await new Promise((resolve) => setTimeout(resolve, 60));
      // The mid-hold flush retains its targets without publishing.
      expect(getPreviewDiagnostic(key)).toBeUndefined();
      setOriginalPreviewActive(false);
      await new Promise((resolve) => setTimeout(resolve, 60));
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(getPreviewDiagnostic(key)?.result.status).toBe("applied");
    } finally {
      btn.remove();
    }
  });
});
