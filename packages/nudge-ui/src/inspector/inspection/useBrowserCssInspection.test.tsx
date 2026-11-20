// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SelectedElement } from "../selection/selectionStore.ts";
import type { InteractionState } from "../shell/styleState.ts";
import type {
  BrowserCssInspection,
  InspectionSnapshot,
} from "./browserCssInspection.ts";
import { useBrowserCssInspection } from "./useBrowserCssInspection.ts";
import type { ResolvedProperty, TokenEntry } from "../../css/model/index.ts";
import { detachToken, resetPendingRules } from "../tokens/editActions.ts";
import { setOriginalPreviewActive } from "../shell/originalPreview.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function snapshot(state: InteractionState, cascade: InspectionSnapshot["cascade"]): InspectionSnapshot {
  return {
    target: { status: "attached" },
    cascade,
    requestedState: state,
    authoredState: cascade === "authored" ? state : "base",
    paintedState: "current",
    properties: [],
    availableTokens: [],
    availableStates: ["base"],
    revision: { element: 0, stylesheet: 0, tokenGeneration: "test" },
    diagnostics: [],
  };
}

describe("useBrowserCssInspection", () => {
  it("owns one session subscription while selection state changes", () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const inspect = vi.fn<BrowserCssInspection["inspect"]>(
      (_element, options = {}) => snapshot(options.state ?? "base", options.cascade ?? "authored"),
    );
    const session: BrowserCssInspection = {
      inspect,
      inspectTokens: () => ({
        inventory: [],
        tokens: [],
        revision: { element: 0, stylesheet: 0, tokenGeneration: "test" },
        diagnostics: [],
      }),
      subscribe,
      notifyStylesheetChange() {},
      dispose() {},
    };
    const element = document.createElement("div");
    document.body.appendChild(element);
    const selected: SelectedElement = {
      cid: "Card",
      src: "src/Card.tsx:1:1",
      cprops: null,
      file: "src/Card.tsx",
      line: 1,
      column: 1,
      domElement: element,
      componentTargets: [],
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    function Probe({ state }: { state: InteractionState }) {
      const view = useBrowserCssInspection(selected, state, { session });
      return <span>{view.element?.requestedState}</span>;
    }

    act(() => root.render(<Probe state="base" />));
    act(() => vi.advanceTimersByTime(20));
    act(() => root.render(<Probe state="hover" />));
    act(() => vi.advanceTimersByTime(20));

    expect(host.textContent).toBe("hover");
    expect(subscribe).toHaveBeenCalledTimes(1);
    // A fresh normalized selection array would grow this count through a render loop.
    expect(inspect).toHaveBeenCalledTimes(3);

    act(() => root.unmount());
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("shows a recorded edit in place of the token the page still paints, and the page while peeking", () => {
    vi.useFakeTimers();
    resetPendingRules();
    const space: TokenEntry = { name: "--space-4", value: "16px", source: "tokens.css:4" };
    const pageRow: ResolvedProperty = {
      property: "padding-top",
      tokenName: space.name,
      declaredValue: "var(--space-4)",
      resolvedValue: "16px",
      confidence: "exact",
      evidence: { selector: ".card", reason: "page rule" },
    };
    // The page keeps reporting the token, as it does while a handoff check lifts the preview.
    const session: BrowserCssInspection = {
      inspect: (_element, options = {}) => ({
        ...snapshot(options.state ?? "base", options.cascade ?? "authored"),
        properties: [pageRow],
        availableTokens: [space],
      }),
      inspectTokens: () => ({ inventory: [], tokens: [], revision: { element: 0, stylesheet: 0, tokenGeneration: "test" }, diagnostics: [] }),
      subscribe: () => () => undefined,
      notifyStylesheetChange() {},
      dispose() {},
    };
    const element = document.createElement("div");
    element.setAttribute("data-cid", "Card");
    element.setAttribute("data-src", "src/Card.tsx:1:1");
    document.body.appendChild(element);
    const selected: SelectedElement = {
      cid: "Card", src: "src/Card.tsx:1:1", cprops: null, file: "src/Card.tsx", line: 1, column: 1,
      domElement: element, componentTargets: [],
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    function Probe() {
      const row = useBrowserCssInspection(selected, "base", { session }).element?.properties[0];
      return <span>{row ? `${row.tokenName ?? "raw"} ${row.declaredValue}` : ""}</span>;
    }
    const flushFrames = () => act(() => vi.advanceTimersByTime(100));

    act(() => root.render(<Probe />));
    flushFrames();
    expect(host.textContent).toBe("--space-4 var(--space-4)");

    act(() => { detachToken(element, "padding-top", "14px", space); });
    flushFrames();
    expect(host.textContent).toBe("raw 14px");

    act(() => setOriginalPreviewActive(true));
    flushFrames();
    expect(host.textContent).toBe("--space-4 var(--space-4)");

    act(() => setOriginalPreviewActive(false));
    act(() => root.unmount());
    resetPendingRules();
  });
});
