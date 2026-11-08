// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CANVAS_RENDERER_ATTR } from "./canvas/roleDetection.ts";

import { consumeDemoOpenPanelIntent, markDocumentNoindex, openDemoEditor } from "./demoEditor.ts";

const openNudgeUi = vi.fn();
const OPEN_PANEL_KEY = "nudge-ui:demo-open-panel";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  sessionStorage.clear();
  openNudgeUi.mockClear();
});

afterEach(() => {
  document.head.querySelectorAll('meta[name="robots"]').forEach((meta) => meta.remove());
  vi.restoreAllMocks();
});

describe("openDemoEditor", () => {
  it("opens the editor from the plain page and asks it to expand the panel", () => {
    openDemoEditor(openNudgeUi);

    expect(openNudgeUi).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(OPEN_PANEL_KEY)).toBe("1");
  });

  it("opens the editor from the direct application view", () => {
    window.history.replaceState(null, "", "/?__nudge_ui_direct=1");

    openDemoEditor(openNudgeUi);

    expect(openNudgeUi).toHaveBeenCalledTimes(1);
  });

  it("ignores the event inside the editor document, which opens its own panel", () => {
    window.history.replaceState(null, "", "/?nudge-ui=editor");

    openDemoEditor(openNudgeUi);

    expect(openNudgeUi).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(OPEN_PANEL_KEY)).toBeNull();
  });

  it("ignores the event inside a Canvas frame, which relays it to the editor", () => {
    const frame = document.createElement("iframe");
    frame.setAttribute(CANVAS_RENDERER_ATTR, "");
    vi.spyOn(window, "frameElement", "get").mockReturnValue(frame);

    openDemoEditor(openNudgeUi);

    expect(openNudgeUi).not.toHaveBeenCalled();
  });

  it("still opens the editor, collapsed, when storage is denied", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    openDemoEditor(openNudgeUi);

    expect(openNudgeUi).toHaveBeenCalledTimes(1);
  });
});

describe("consumeDemoOpenPanelIntent", () => {
  it("reads the request once, so a refresh opens collapsed", () => {
    sessionStorage.setItem(OPEN_PANEL_KEY, "1");

    expect(consumeDemoOpenPanelIntent()).toBe(true);
    expect(sessionStorage.getItem(OPEN_PANEL_KEY)).toBeNull();
    expect(consumeDemoOpenPanelIntent()).toBe(false);
  });

  it("reports no request when storage is denied", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(consumeDemoOpenPanelIntent()).toBe(false);
  });
});

describe("markDocumentNoindex", () => {
  it("adds one robots noindex tag however often it runs", () => {
    markDocumentNoindex();
    markDocumentNoindex();

    const tags = document.head.querySelectorAll('meta[name="robots"]');
    expect(tags).toHaveLength(1);
    expect(tags[0]?.getAttribute("content")).toBe("noindex");
  });
});
