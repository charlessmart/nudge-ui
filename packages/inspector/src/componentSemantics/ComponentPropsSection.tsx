import type { ReactElement } from "react";
import type { SelectedElement } from "../selectionStore.ts";
import { isComponentChange, useChanges } from "../changesLog.ts";
import { FieldRow } from "../ui/FieldRow.tsx";
import { Select } from "../ui/Select.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { editableComponentTargets } from "./index.ts";
import { setComponentProp } from "./changeAction.ts";
import type {
  ComponentPropContract,
  ComponentPropValue,
  EditableComponentTarget,
} from "./types.ts";

function pendingValue(
  target: EditableComponentTarget,
  prop: ComponentPropContract,
  changes: ReturnType<typeof useChanges>,
): ComponentPropValue | undefined {
  const pending = changes.find((change) =>
    isComponentChange(change)
    && change.target.framework === target.framework
    && change.target.callsiteId === target.meta.callsiteId
    && change.property === prop.name);
  if (pending && isComponentChange(pending)) return pending.after;
  const current = target.props[prop.name];
  return typeof current === "string" || typeof current === "number" || typeof current === "boolean"
    ? current
    : undefined;
}

function valueFromOption(prop: ComponentPropContract, serialized: string): ComponentPropValue {
  return prop.options.find((option) => String(option) === serialized) ?? serialized;
}

export function ComponentPropsSection({ selected }: { selected: SelectedElement }): ReactElement | null {
  const changes = useChanges();
  const target = editableComponentTargets(selected.componentTargets)[0];
  if (!target) return null;
  // Text contracts are owned by the scoped inline editor in this slice. A
  // panel input would turn every keystroke into an independent history entry;
  // a single-commit panel transaction belongs to a later interaction design.
  const visibleProps = target.contract.props.filter((prop) =>
    prop.control !== "text" && pendingValue(target, prop, changes) !== undefined);
  if (visibleProps.length === 0) return null;

  return (
    <section
      className="dt-editor dt-component-props"
      data-test="component-props-section"
      data-component={target.meta.componentName}
    >
      <div className="dt-editor__title-row">
        <div className="dt-editor__title">{target.meta.componentName}</div>
      </div>
      {visibleProps.map((prop) => {
        const current = pendingValue(target, prop, changes)!;
        return (
          <FieldRow
            key={prop.name}
            label={prop.name}
            property={prop.name}
            data-test="component-prop"
          >
            {prop.control === "boolean" ? (
              <SegmentedControl
                aria-label={`${prop.name} component prop`}
                data-test="component-prop-boolean"
                data-property={prop.name}
                value={current ? "true" : "false"}
                options={[
                  { value: "false", label: "Off" },
                  { value: "true", label: "On" },
                ]}
                onChange={(value) => setComponentProp(target, prop, value === "true")}
              />
            ) : (
              <Select
                data-test={`component-prop-${prop.name}`}
                value={String(current)}
                options={prop.options.map((option) => ({
                  value: String(option),
                  label: String(option),
                }))}
                onValueChange={(value) =>
                  setComponentProp(target, prop, valueFromOption(prop, value))}
              />
            )}
          </FieldRow>
        );
      })}
    </section>
  );
}
