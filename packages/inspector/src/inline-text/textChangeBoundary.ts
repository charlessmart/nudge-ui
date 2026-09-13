/**
 * Compatibility seam for the former inline-text model owner. The shared
 * vocabulary and guards now live in `changes/editModel.ts`.
 */
export type {
  TextBindingEvidence,
  TextContentChangeRecord,
  TextProjectionScope,
  TextProjectionSourceSite,
  TextProjectionTarget,
} from "../changes/editModel.ts";
export {
  isTextContentChangeListValue,
  isTextContentChangeValue,
  isTextProjectionTargetValue,
} from "../changes/editModel.ts";
