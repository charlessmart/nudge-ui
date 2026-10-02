// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadWorkspaceChanges } from "../changes/changesLog.ts";
import type { ElementChangeRecord } from "../changes/types.ts";
import {
  activateDraftForCard,
  forkDraftForCard,
  getVersionHistorySnapshot,
  getWorkspaceForCard,
  initializeVersionHistory,
  removeCardHistory,
  resetVersionHistory,
} from "./store.ts";

function change(rawValue: string): ElementChangeRecord {
  return {
    cid: "Heading",
    file: "src/Heading.tsx",
    line: 2,
    selector: '[data-cid="Heading"]',
    property: "color",
    oldToken: null,
    newToken: null,
    oldRawValue: "black",
    rawValue,
    source: { file: "src/Heading.tsx", line: 2, component: "Heading" },
  };
}

beforeEach(() => {
  localStorage.clear();
  resetVersionHistory();
  loadWorkspaceChanges([change("red")], []);
});

describe("version history drafts", () => {
  it("forks a duplicated card and keeps subsequent edits independent", () => {
    initializeVersionHistory("project", ["original"]);
    activateDraftForCard("original");
    expect(forkDraftForCard("original", "duplicate")).not.toBeNull();

    activateDraftForCard("duplicate");
    loadWorkspaceChanges([change("blue")], []);

    expect(getWorkspaceForCard("original")?.changes[0]).toMatchObject({ rawValue: "red" });
    expect(getWorkspaceForCard("duplicate")?.changes[0]).toMatchObject({ rawValue: "blue" });
  });

  it("reads the live workspace for the active draft", () => {
    initializeVersionHistory("project", ["original"]);
    activateDraftForCard("original");
    loadWorkspaceChanges([change("green")], []);
    expect(getWorkspaceForCard("original")?.changes[0]).toMatchObject({ rawValue: "green" });
  });

  it("drops per-card associations without deleting drafts", () => {
    initializeVersionHistory("project", ["original"]);
    activateDraftForCard("original");
    forkDraftForCard("original", "duplicate");
    removeCardHistory("duplicate");
    expect(getWorkspaceForCard("duplicate")).toBeNull();
    expect(getVersionHistorySnapshot().drafts).toHaveLength(2);
  });
});

afterEach(() => {
  resetVersionHistory();
});