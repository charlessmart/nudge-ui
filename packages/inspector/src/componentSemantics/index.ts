export {
  editableComponentTargets,
  inspectComponentTargets,
  registerComponentRuntimeAdapter,
  replaceComponentOverrideProjection,
} from "./adapterRegistry.ts";

export type {
  AuthoredPropKind,
  ComponentChangeRecord,
  ComponentChangeTarget,
  ComponentContract,
  ComponentFramework,
  ComponentInvocationMeta,
  ComponentOverride,
  ComponentPropBaseline,
  ComponentPropContract,
  ComponentPropValue,
  EditableComponentTarget,
  RuntimeComponentTarget,
} from "./types.ts";
export {
  resolveTextBinding,
  VISIBLE_TEXT_PROP_PRIORITY,
} from "./textBinding.ts";
export type {
  TextBindingCandidate,
  TextEditBinding,
  TextEditRejection,
  TextEditRejectionReason,
} from "./textBinding.ts";
