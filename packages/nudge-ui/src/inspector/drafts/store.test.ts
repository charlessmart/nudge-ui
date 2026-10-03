import { persistDrafts } from "./store.ts";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadWorkspaceChanges } from "../changes/changesLog.ts";
import type { ElementChangeRecord } from "../changes/types.ts";
import {
  activateDraftForCard,
  createStudyDraft,
  getDraftsSnapshot,
  getWorkspaceForCard,
  initializeDrafts,
  removeCardDraft,
  resetDrafts,
  clearCommittedArtifactDraft,
  getDraftForCard,
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
  resetDrafts();
  loadWorkspaceChanges([change("red")], []);
});

describe("draft ownership", () => {
  it("forks a duplicated card and keeps subsequent edits independent", () => {
    initializeDrafts("project", ["original"]);
    activateDraftForCard("original");
    expect(createStudyDraft("original", "duplicate", "duplicate")).not.toBeNull();

    activateDraftForCard("duplicate");
    loadWorkspaceChanges([change("blue")], []);

    expect(getWorkspaceForCard("original")?.changes[0]).toMatchObject({ rawValue: "red" });
    expect(getWorkspaceForCard("duplicate")?.changes[0]).toMatchObject({ rawValue: "blue" });
  });

  it("reads the live workspace for the active draft", () => {
    initializeDrafts("project", ["original"]);
    activateDraftForCard("original");
    loadWorkspaceChanges([change("green")], []);
    expect(getWorkspaceForCard("original")?.changes[0]).toMatchObject({ rawValue: "green" });
  });

  it("drops per-card associations without deleting drafts", () => {
    initializeDrafts("project", ["original"]);
    activateDraftForCard("original");
    createStudyDraft("original", "duplicate", "duplicate");
    removeCardDraft("duplicate");
    expect(getWorkspaceForCard("duplicate")).toBeNull();
    expect(getDraftsSnapshot().drafts).toHaveLength(2);
  });
});

it("restores independent drafts from the sole persisted intent owner", () => {
  initializeDrafts("project", ["original"]);
  activateDraftForCard("original");
  createStudyDraft("original", "study", "study");
  activateDraftForCard("study");
  loadWorkspaceChanges([change("blue")], []);
  persistDrafts();
  resetDrafts();
  loadWorkspaceChanges([], []);

  initializeDrafts("project", ["original", "study"]);
  activateDraftForCard("study");
  expect(getWorkspaceForCard("study")?.changes).toMatchObject([{ rawValue: "blue" }]);
  activateDraftForCard("original");
  expect(getWorkspaceForCard("original")?.changes).toMatchObject([{ rawValue: "red" }]);
});

it("keeps newer intent when a save tries to clear an older draft revision", () => {
  initializeDrafts("project", ["original"]);
  activateDraftForCard("original");
  const saved = getDraftForCard("original")!;
  loadWorkspaceChanges([change("blue")], []);
  expect(clearCommittedArtifactDraft("original", saved.revision)).toBe(false);
  expect(getWorkspaceForCard("original")?.changes).toMatchObject([{ rawValue: "blue" }]);
});

it("keeps demo drafts in memory without reading or replacing saved project drafts", () => {
  const key = "nudge-ui-drafts:project:v1";
  localStorage.setItem(key, "saved development workspace");
  initializeDrafts("project", ["demo"], { persistent: false });
  activateDraftForCard("demo");
  loadWorkspaceChanges([change("purple")], []);
  expect(getWorkspaceForCard("demo")?.changes).toMatchObject([{ rawValue: "purple" }]);
  expect(localStorage.getItem(key)).toBe("saved development workspace");
});

it.each(["invalid-record", "duplicate-draft", "dangling-reference", "duplicate-target"])("discards malformed draft persistence: %s", (failure) => {
  initializeDrafts("project", ["original"]);
  const key = "nudge-ui-drafts:project:v1";
  persistDrafts();
  const stored = JSON.parse(localStorage.getItem(key)!);
  if (failure === "invalid-record") stored.drafts[0].contents.changes = [{ kind: "component-prop", target: null }];
  if (failure === "duplicate-draft") stored.drafts.push(stored.drafts[0]);
  if (failure === "dangling-reference") stored.cardDrafts.original = "missing-draft";
  if (failure === "duplicate-target") stored.drafts.push({ ...stored.drafts[0], id: "other-draft" });
  persistDrafts();
  resetDrafts();
  loadWorkspaceChanges([], []);
  localStorage.setItem(key, JSON.stringify(stored));

  initializeDrafts("project", ["original"]);
  activateDraftForCard("original");
  expect(getWorkspaceForCard("original")).toEqual({ changes: [], structuralChanges: [] });
});

afterEach(() => {
  resetDrafts();
});
