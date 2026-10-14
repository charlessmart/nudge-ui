import type {
  ComponentChangeRecord,
  ComponentChangeTarget,
} from "../componentSemantics/types.ts";
import { commitDraftContents, getActiveDraftChanges } from "../drafts/store.ts";
import { clearSessionUndoHistory } from "../workspace/timeline.ts";
import type { StructuralChange } from "./structuralTypes.ts";
import type { ChangeRecord } from "./types.ts";

export function replaceActiveDraft(
  changes: readonly ChangeRecord[],
  structuralChanges: readonly StructuralChange[] = getActiveDraftChanges().structuralChanges,
): void {
  commitDraftContents(changes, structuralChanges);
  clearSessionUndoHistory();
}

type ComponentChangeOverrides =
  & Partial<Omit<ComponentChangeRecord, "target">>
  & { target?: Partial<ComponentChangeTarget> };

export function makeComponentChange(
  overrides: ComponentChangeOverrides = {},
): ComponentChangeRecord {
  const { target: targetOverrides, ...recordOverrides } = overrides;
  return {
    kind: "component-prop",
    target: {
      framework: "react",
      componentId: "src/ui/Button#Button",
      callsiteId: "src/App.tsx:12:4",
      componentName: "Button",
      file: "src/App.tsx",
      line: 12,
      column: 4,
      ...targetOverrides,
    },
    property: "variant",
    before: { kind: "value", value: "primary" },
    after: "secondary",
    authoredAs: "literal",
    ...recordOverrides,
  };
}
