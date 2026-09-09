// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { ElementChangeRecord } from "../changes/types.ts";
import type { StructuralDelete } from "../changes/structuralTypes.ts";
import type { WorkspaceChangesSnapshot } from "../changes/workspaceChanges.ts";
import {
  applyWorkspaceProjection,
  compileWorkspaceProjection,
  type DocumentProjectionAdapter,
} from "./workspaceProjection.ts";

const styleChange: ElementChangeRecord = {
  cid: "Button",
  file: "src/Button.tsx",
  line: 1,
  selector: '[data-cid="Button"]',
  property: "color",
  oldToken: null,
  newToken: null,
  oldRawValue: "black",
  rawValue: "red",
  source: { file: "src/Button.tsx", line: 1, component: "Button" },
};

const structuralDelete: StructuralDelete = {
  id: "delete-button",
  kind: "delete",
  target: {
    sourceSite: { cid: "Button", src: "src/Button.tsx:1:1" },
    locator: { kind: "evidence", occurrence: 0, props: null, text: "Save" },
  },
};

function snapshot(): WorkspaceChangesSnapshot {
  return {
    revision: 4,
    changes: [styleChange],
    structuralChanges: [structuralDelete],
    canUndo: true,
    canRedo: false,
  };
}

describe("workspace projection", () => {
  it("compiles every projection dimension from one snapshot", () => {
    const plan = compileWorkspaceProjection(snapshot());

    expect(plan.sourceRevision).toBe(4);
    expect(plan.structuralChanges).toEqual([structuralDelete]);
    expect(plan.css).toContain('[data-cid="Button"]');
    expect(plan.css).toContain("color: red");
  });

  it("applies structural and identity effects before managed styles", () => {
    const calls: string[] = [];
    const adapter: DocumentProjectionAdapter = {
      applyStructural: () => calls.push("structural"),
      applyRenderedInstances: () => calls.push("instances"),
      applyText: () => calls.push("text"),
      applyComponents: () => calls.push("components"),
      applyManagedStyles: () => calls.push("styles"),
    };

    applyWorkspaceProjection(adapter, compileWorkspaceProjection(snapshot()));

    expect(calls).toEqual(["structural", "instances", "text", "components", "styles"]);
  });
});
