import { appendChange } from "../changes/changesLog.ts";
import type {
  ComponentChangeRecord,
  ComponentPropContract,
  ComponentPropValue,
  EditableComponentTarget,
} from "./types.ts";
import { createComponentPropChange } from "./changeModel.ts";

export { createComponentPropChange } from "./changeModel.ts";

export function setComponentProp(
  target: EditableComponentTarget,
  prop: ComponentPropContract,
  value: ComponentPropValue,
): ComponentChangeRecord {
  const change = createComponentPropChange(target, prop, value);
  appendChange(change);
  return change;
}
