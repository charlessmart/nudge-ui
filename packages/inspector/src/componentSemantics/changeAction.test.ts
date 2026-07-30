import { describe, expect, it } from "vitest";
import { createComponentPropChange } from "./changeAction.ts";
import type { EditableComponentTarget } from "./types.ts";

const target: EditableComponentTarget = {
  framework: "react",
  meta: {
    callsiteId: "src/App.tsx:12:4",
    componentId: "src/ui/Button#Button",
    componentName: "Button",
    file: "src/App.tsx",
    line: 12,
    column: 4,
    authoredProps: { variant: "literal" },
  },
  props: { variant: "primary" },
  contract: {
    componentId: "src/ui/Button#Button",
    name: "Button",
    file: "src/ui/Button.tsx",
    provenance: "typescript",
    props: [{
      name: "variant",
      control: "select",
      options: ["primary", "secondary"],
      optional: true,
    }],
  },
};

describe("createComponentPropChange", () => {
  it("keeps invocation and definition identity separate", () => {
    expect(createComponentPropChange(target, target.contract.props[0]!, "secondary"))
      .toMatchObject({
        kind: "component-prop",
        target: {
          componentId: "src/ui/Button#Button",
          callsiteId: "src/App.tsx:12:4",
          file: "src/App.tsx",
        },
        property: "variant",
        before: { kind: "value", value: "primary" },
        after: "secondary",
        authoredAs: "literal",
      });
  });

  it("marks a missing invocation prop as a default-authored baseline", () => {
    const missing = {
      ...target,
      meta: { ...target.meta, authoredProps: {} },
      props: {},
    };
    expect(createComponentPropChange(missing, target.contract.props[0]!, "secondary"))
      .toMatchObject({
        before: { kind: "default" },
        authoredAs: "default",
      });
  });
});
