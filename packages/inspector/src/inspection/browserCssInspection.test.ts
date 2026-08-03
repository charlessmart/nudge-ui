// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { TokenDefinition } from "virtual:design-tokens";
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
}];

let sessions: BrowserCssInspection[] = [];

afterEach(() => {
  sessions.forEach((session) => session.dispose());
  sessions = [];
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

function createSession(): BrowserCssInspection {
  const session = createBrowserCssInspection({
    document,
    tokenKnowledge: { definitions, generation: "test-1" },
  });
  sessions.push(session);
  return session;
}

function mount(): HTMLElement {
  const style = document.createElement("style");
  style.textContent = `
    .card { --color-brand: #123456; color: var(--color-brand); }
    .card:hover { color: var(--color-brand); }
  `;
  document.head.appendChild(style);
  const card = document.createElement("article");
  card.className = "card";
  document.body.appendChild(card);
  return card;
}

describe("BrowserCssInspection", () => {
  it("returns one read-only snapshot containing token availability, authored state, and browser rows", () => {
    const snapshot = createSession().inspect(mount());

    expect(snapshot.target.status).toBe("attached");
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
    const snapshot = createSession().inspect(mount(), { state: "hover" });

    expect(snapshot.requestedState).toBe("hover");
    expect(snapshot.authoredState).toBe("hover");
    expect(snapshot.paintedState).toBe("current");
    expect(snapshot.diagnostics).toEqual([]);
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
    const seen: Array<{ stylesheet: number; tokenGeneration: string | number }> = [];
    const unsubscribe = session.subscribe((revision) => seen.push(revision));

    session.notifyStylesheetChange();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.tokenGeneration).toBe("test-1");

    unsubscribe();
    session.notifyStylesheetChange();
    expect(seen).toHaveLength(1);

    session.dispose();
    expect(session.inspect(mount()).target.status).toBe("disposed");
  });
});
