import { appendChange } from "../changes/changesLog.ts";
import type {
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
): void {
  appendChange(createComponentPropChange(target, prop, value));
}
