import { describe, expect, it } from "vitest";
import { createComponentPropChange } from "./changeAction.ts";
import { componentChangeToOverride } from "./changeModel.ts";
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

  it("never projects repeated evidence without an explicit source-site scope", () => {
    const change = createComponentPropChange(target, target.contract.props[0]!, "secondary", {
      evidence: {
        occurrence: 0,
        props: null,
        ariaLabel: null,
        beforeText: "primary",
        mountedCount: 2,
      },
    });
    expect(componentChangeToOverride({ ...change, scope: undefined })).toBeNull();
    expect(componentChangeToOverride({ ...change, scope: "source-site" })).toMatchObject({
      callsiteId: target.meta.callsiteId,
      prop: "variant",
      value: "secondary",
    });
    expect(componentChangeToOverride({ ...change, scope: "rendered-instance" })).toBeNull();
  });

  it("never broadens a repeated expression or spread through source-site scope", () => {
    const expression = createComponentPropChange({
      ...target,
      meta: { ...target.meta, authoredProps: { variant: "expression" } },
    }, target.contract.props[0]!, "secondary", {
      scope: "source-site",
      evidence: {
        occurrence: 0,
        props: null,
        ariaLabel: null,
        beforeText: "primary",
        mountedCount: 2,
      },
    });
    expect(componentChangeToOverride(expression)).toBeNull();
    expect(componentChangeToOverride({ ...expression, authoredAs: "spread" })).toBeNull();
    expect(componentChangeToOverride({ ...expression, authoredAs: "literal" })).not.toBeNull();
    expect(componentChangeToOverride({ ...expression, authoredAs: "malformed" as never })).toBeNull();
  });
});
