// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { makeComponentChange } from "../changes/_testUtils.ts";
import type {
  ElementChangeRecord,
  TextContentChangeRecord,
} from "../changes/types.ts";
import type { StructuralDelete } from "../changes/structuralTypes.ts";
import type { WorkspaceChangesSnapshot } from "../changes/workspaceChanges.ts";
import {
  applyWorkspaceProjection,
  compileWorkspaceProjection,
  type CompiledManagedStyles,
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

const instanceChange: ElementChangeRecord = {
  ...styleChange,
  property: "background-color",
  rawValue: "blue",
  scope: "rendered-instance",
  instanceOverride: {
    id: "save-button",
    target: {
      sourceSite: { cid: "Button", src: "src/Button.tsx:1:1" },
      locator: {
        kind: "evidence",
        occurrence: 0,
        props: null,
        text: "Save",
      },
    },
  },
};

const textChange: TextContentChangeRecord = {
  kind: "text-content",
  id: "button-label",
  target: {
    sourceSite: { cid: "Button", src: "src/Button.tsx:1:1" },
    occurrence: 0,
    props: null,
    ariaLabel: null,
    beforeText: "Save",
  },
  source: { file: "src/Button.tsx", line: 1, column: 1, component: "Button" },
  selector: '[data-cid="Button"]',
  before: "Save",
  after: "Submit",
  authoredAs: "literal",
};

const componentChange = makeComponentChange({
  target: { callsiteId: "src/Button.tsx:1:1" },
  property: "disabled",
  before: { kind: "value", value: false },
  after: true,
});

function snapshot(): WorkspaceChangesSnapshot {
  return {
    revision: 4,
    changes: [styleChange, instanceChange, textChange, componentChange],
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
    expect(plan.managedStyles.css).toContain('[data-cid="Button"]');
    expect(plan.managedStyles.css).toContain("color: red");
    expect(plan.managedStyles.css).toContain('[data-projection-instance="save-button"]');
    expect(plan.instanceOverrides).toEqual([instanceChange.instanceOverride]);
    expect(plan.textContentChanges).toEqual([textChange]);
    expect(plan.componentOverrides).toEqual([{
      framework: "react",
      callsiteId: "src/Button.tsx:1:1",
      prop: "disabled",
      value: true,
    }]);
  });

  it("applies structural and identity effects before managed styles", () => {
    const calls: string[] = [];
    const adapter: DocumentProjectionAdapter<CompiledManagedStyles> = {
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
