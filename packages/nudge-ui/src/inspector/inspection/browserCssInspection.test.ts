// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TokenDefinition } from "../../css/model/index.ts";
import {
  createBrowserCssInspection,
  type BrowserCssInspection,
} from "./browserCssInspection.ts";

const definitions: TokenDefinition[] = [{
  name: "theme.color.brand",
  cssName: "--color-brand",
  declarations: [{
    value: "#123456",
    source: "theme.css",
    important: false,
    context: { selector: ":root" },
  }],
}, {
  name: "theme.color.surface",
  cssName: "--surface",
  declarations: [{
    value: "#ffffff",
    source: "theme.css",
    important: false,
    context: { selector: ":root" },
  }],
}];

let sessions: BrowserCssInspection[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  sessions.forEach((session) => session.dispose());
  sessions = [];
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

function createSession(generation: string | number = "test-1"): BrowserCssInspection {
  const session = createBrowserCssInspection({
    document,
    tokenKnowledge: { definitions, generation },
  });
  sessions.push(session);
  return session;
}

function mount(): HTMLElement {
  const style = document.createElement("style");
  style.textContent = `
    .card { --color-brand: #123456; --surface: #ffffff; color: var(--color-brand); }
    .card:hover { color: var(--color-brand); }
    .button { --surface: #ffffff; background: var(--surface); }
    .button:hover { background: #c4f36b; }
  `;
  document.head.appendChild(style);
  const card = document.createElement("article");
  card.className = "card";
  document.body.appendChild(card);
  return card;
}

function mountButton(): HTMLElement {
  mount();
  const button = document.createElement("button");
  button.className = "button";
  document.body.appendChild(button);
  return button;
}

describe("BrowserCssInspection", () => {
  it("returns one read-only snapshot containing token availability, authored state, and browser rows", () => {
    const snapshot = createSession().inspect(mount());

    expect(snapshot.target.status).toBe("attached");
    expect(snapshot.cascade).toBe("authored");
    expect(snapshot.requestedState).toBe("base");
    expect(snapshot.authoredState).toBe("base");
    expect(snapshot.paintedState).toBe("current");
    expect(snapshot.availableTokens).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "theme.color.brand", cssName: "--color-brand" }),
    ]));
    expect(snapshot.availableStates).toEqual(["base", "hover"]);
    expect(snapshot.properties.find((row) => row.property === "color")).toMatchObject({
      authored: "var(--color-brand)",
      tokenName: "theme.color.brand",
    });
  });

  it("keeps hypothetical interaction state separate from the painted browser state", () => {
    const snapshot = createSession().inspect(mount(), { state: "hover", cascade: "authored" });

    expect(snapshot.cascade).toBe("authored");
    expect(snapshot.requestedState).toBe("hover");
    expect(snapshot.authoredState).toBe("hover");
    expect(snapshot.paintedState).toBe("current");
    expect(snapshot.diagnostics).toEqual([]);
  });

  it("uses authored-base cascade so base ignores hover declarations", () => {
    const button = mountButton();
    const session = createSession();

    const base = session.inspect(button, { state: "base", cascade: "authored" });
    const hover = session.inspect(button, { state: "hover", cascade: "authored" });

    expect(base.properties.find((row) => row.property === "background")).toMatchObject({
      authored: "var(--surface)",
      tokenName: "theme.color.surface",
    });
    expect(hover.properties.find((row) => row.property === "background")).toMatchObject({
      authored: "#c4f36b",
    });
  });

  it("stable cascade exposes non-transient token rows for editor linking", () => {
    const button = mountButton();
    const snapshot = createSession().inspect(button, { cascade: "stable" });

    expect(snapshot.cascade).toBe("stable");
    expect(snapshot.authoredState).toBe("base");
    expect(snapshot.properties.find((row) => row.property === "background" && row.tokenName)).toMatchObject({
      tokenName: "theme.color.surface",
      authored: "var(--surface)",
    });
  });

  it("retains inline declarations in the base snapshot", () => {
    const element = mount();
    element.style.setProperty("border-color", "var(--color-brand)");

    const row = createSession().inspect(element).properties.find((candidate) => candidate.property === "border-color");

    expect(row).toMatchObject({
      authored: "var(--color-brand)",
      evidence: { selector: "[style]" },
    });
  });

  it("keeps inline declarations inside the shared important cascade", () => {
    const element = mount();
    const style = document.createElement("style");
    style.textContent = ".card { border-color: red !important; }";
    document.head.appendChild(style);
    element.style.setProperty("border-color", "blue");
    const session = createSession();

    expect(session.inspect(element, { cascade: "live" }).properties
      .find((row) => row.property === "border-color")?.authored).toBe("red");

    element.style.setProperty("border-color", "blue", "important");
    session.notifyStylesheetChange();
    expect(session.inspect(element, { cascade: "live" }).properties
      .find((row) => row.property === "border-color")?.authored).toBe("blue");
  });

  it("accepts explicit compiler entries without widening runtime availability", () => {
    const style = document.createElement("style");
    style.textContent = ".card { font-weight: var(--type-weight-strong, 600); }";
    document.head.appendChild(style);
    const card = document.createElement("article");
    card.className = "card";
    document.body.appendChild(card);

    const snapshot = createBrowserCssInspection({
      document,
      tokenKnowledge: {
        definitions: [{
          name: "type.weight.strong",
          cssName: "--type-weight-strong",
          declarations: [{ value: "650", source: "tokens.css", important: false, context: {} }],
        }],
        entries: [{ name: "type.weight.strong", cssName: "--type-weight-strong", value: "650", source: "tokens.css" }],
        generation: "test-entries",
      },
    });
    sessions.push(snapshot);
    const inspection = snapshot.inspect(card);

    expect(inspection.availableTokens).toEqual([]);
    expect(inspection.properties.find((row) => row.property === "font-weight")).toMatchObject({
      tokenName: "type.weight.strong",
    });
  });

  it("returns the revision-aware document token catalog through the same interface", () => {
    const root = document.documentElement;
    root.style.setProperty("--color-brand", "#123456");
    const snapshot = createSession().inspectTokens(root);

    expect(snapshot.tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({
        authoredValue: "#123456",
        definition: expect.objectContaining({ name: "theme.color.brand" }),
      }),
    ]));
    expect(snapshot.inventory.map((row) => row.definition.name)).toEqual([
      "theme.color.brand",
      "theme.color.surface",
    ]);
    expect(snapshot.tokens.map((row) => row.definition.name)).toEqual([
      "theme.color.brand",
    ]);
    expect(snapshot.revision.tokenGeneration).toBe("test-1");
  });

  it("is inert when the dev-only contract is disabled", () => {
    vi.stubEnv("DEV", false);
    const session = createBrowserCssInspection({
      document,
      tokenKnowledge: { definitions, generation: "production" },
    });
    sessions.push(session);

    expect(session.inspect(mount()).target.status).toBe("disabled");
    expect(session.inspectTokens().inventory).toEqual([]);
    expect(session.inspectTokens().tokens).toEqual([]);
    const listener = vi.fn();
    session.subscribe(listener);
    session.notifyStylesheetChange();
    expect(listener).not.toHaveBeenCalled();
  });

  it("reuses the resolver token table across inspect calls until the document revision changes", () => {
    const button = mountButton();
    const session = createSession();

    const first = session.inspect(button, { state: "base", cascade: "authored" });
    const second = session.inspect(button, { state: "base", cascade: "authored" });
    // Snapshot properties are cloned defensively, but attribution must stay
    // identical when the cascade inputs have not changed.
    expect(second.properties).toEqual(first.properties);
    expect(second.revision).toEqual(first.revision);

    session.notifyStylesheetChange();
    const third = session.inspect(button, { state: "base", cascade: "authored" });
    expect(third.revision.stylesheet).toBeGreaterThan(first.revision.stylesheet);
    expect(third.properties.find((row) => row.property === "background")).toMatchObject({
      tokenName: "theme.color.surface",
    });
  });

  it("reports document ownership and unsupported state as structured diagnostics", () => {
    const session = createSession();
    const foreignDocument = document.implementation.createHTMLDocument("foreign");
    const foreignElement = foreignDocument.createElement("div");

    const foreignSnapshot = session.inspect(foreignElement);
    expect(foreignSnapshot.target.status).toBe("foreign-document");
    expect(foreignSnapshot.diagnostics).toContainEqual(expect.objectContaining({ code: "target-document-mismatch" }));

    const local = mount();
    const unavailable = session.inspect(local, { state: "disabled" });
    expect(unavailable.diagnostics).toContainEqual(expect.objectContaining({ code: "state-unavailable" }));
  });

  it("notifies subscribers for document revisions and stops after disposal", () => {
    const session = createSession();
    const before = session.inspect(mount()).revision.stylesheet;
    const seen: Array<{ stylesheet: number; tokenGeneration: string | number }> = [];
    const unsubscribe = session.subscribe((revision) => seen.push(revision));

    session.notifyStylesheetChange();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.stylesheet).toBeGreaterThan(before);
    expect(seen[0]?.tokenGeneration).toBe("test-1");

    unsubscribe();
    session.notifyStylesheetChange();
    expect(seen).toHaveLength(1);

    session.dispose();
    expect(session.inspect(mount()).target.status).toBe("disposed");
  });

  it("owns media-query invalidation for document token and element snapshots", () => {
    let onMediaChange: (() => void) | undefined;
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => { onMediaChange = listener; },
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    const session = createBrowserCssInspection({
      document,
      tokenKnowledge: {
        definitions: [{
          ...definitions[0]!,
          declarations: [{
            ...definitions[0]!.declarations[0]!,
            context: {
              selector: ":root",
              wrappers: [{ kind: "media", params: "(prefers-color-scheme: dark)" }],
            },
          }],
        }],
        generation: "media",
      },
    });
    sessions.push(session);
    const listener = vi.fn();
    session.subscribe(listener);

    onMediaChange?.();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
