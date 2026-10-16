import type { ReactElement } from "react";
import type { SelectedElement } from "../selection/selectionStore.ts";
import { isComponentChange } from "../changes/types.ts";
import { useChanges } from "../drafts/store.ts";
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

export interface ComponentPropsView {
  target: EditableComponentTarget;
  visibleProps: ComponentPropContract[];
  changes: ReturnType<typeof useChanges>;
}

export function useComponentProps(selected: SelectedElement | null): ComponentPropsView | null {
  const changes = useChanges();
  const target = selected ? editableComponentTargets(selected.componentTargets)[0] : undefined;
  if (!target) return null;
  // Text props are owned by the scoped inline editor, not this panel.
  const visibleProps = target.contract.props.filter((prop) =>
    prop.control !== "text" && pendingValue(target, prop, changes) !== undefined);
  return visibleProps.length === 0 ? null : { target, visibleProps, changes };
}

export function ComponentPropsSection({ selected }: { selected: SelectedElement }): ReactElement | null {
  const view = useComponentProps(selected);
  if (!view) return null;
  const { target, visibleProps, changes } = view;

  return (
    <section
      className="editor component-props"
      data-test="component-props-section"
      data-component={target.meta.componentName}
    >
      <div className="editor__title-row">
        <div className="editor__title">{target.meta.componentName}</div>
      </div>
      {target.livePreview === false ? (
        <div className="component-props__hint" data-test="component-props-prompt-only">
          Live preview isn't available here. Changes are added to the prompt.
        </div>
      ) : null}
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
