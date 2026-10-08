export { bootstrapNudgeUi, mountInspector, unmountInspector } from "./boot.ts";
export { resolveNudgeUiClientEntry } from "../transport/editor.ts";
export { toggleInspector, setInspectorOpen } from "./shell/openStore.ts";
export { InspectorShell } from "./shell/InspectorShell.tsx";
export { detectFramework } from "./prompt/detectFramework.ts";
export {
  installStaticHtmlRuntimeIdentity,
  isRuntimeGeneratedSource,
  RUNTIME_ELEMENT_CID_PREFIX,
  RUNTIME_UNKNOWN_SOURCE_PREFIX,
} from "./runtime/staticHtmlRuntimeIdentity.ts";
export { isCanvasRenderer } from "./canvas/roleDetection.ts";
export {
  createNudgeUiEditorUrl,
  hasNudgeUiDirectTabIntent,
  isNudgeUiDirectUrl,
  readNudgeUiEditorTarget,
  rememberNudgeUiDirectTabIntent,
} from "../transport/editor.ts";
export { NUDGE_UI_INSPECTION_VERSION, inspectElement, installInspectionBridge } from "./inspection/bridge.ts";
export type { NudgeUiInspectionBridge, ElementInspection, InspectElementOptions, InspectionCatalogEntry, InspectionControl } from "./inspection/bridge.ts";
export {
  beginInlineTextEdit,
  cancelInlineTextEdit,
  disposeInlineTextEdit,
  getInlineTextDiagnostic,
  getInlineTextDiagnostics,
  getInlineTextSession,
  inlineTextEditor,
  isInlineTextEditingActive,
  subscribeInlineTextDiagnostics,
  resolveTextBinding,
  useInlineTextSession,
} from "./inline-text/inlineTextEditor.ts";
export type {
  InlineTextEditor,
  InlineTextDiagnostic,
  InlineTextSession,
  InlineTextInputRejectionReason,
  InlineTextSessionEndReason,
  TextBindingCandidate,
  TextEditBinding,
  TextEditRejection,
} from "./inline-text/inlineTextEditor.ts";
export { projectInspectorValues, projectionSides } from "./spacing/projection.ts";
export type { InspectorAxisProjection, InspectorFieldProjection, InspectorProjection, InspectorSpacingProjection, ProjectionAxis, ProjectionGroup, ProjectionSide, ProjectionState } from "./spacing/projection.ts";
export { createBrowserCssInspection } from "./inspection/browserCssInspection.ts";
export {
  configureNudgeUiRuntime,
  getNudgeUiRuntimeConfig,
  normalizeNudgeUiRuntimeConfig,
  subscribeNudgeUiRuntime,
} from "./runtime/runtimeConfig.ts";
export { useNudgeUiRuntimeConfig } from "./runtime/useRuntimeConfig.ts";
export { isNudgeUiDev, setNudgeUiHostDevFlag } from "./runtime/devFlag.ts";
export type {
  NudgeUiRuntimeConfig,
  NudgeUiRuntimeCapabilities,
  NudgeUiRuntimeFramework,
  NudgeUiRuntimeHost,
} from "./runtime/runtimeConfig.ts";
export type {
  BrowserCssInspection,
  BrowserCssInspectionConfig,
  BrowserCssInspectionOptions,
  BrowserTokenKnowledge,
  DocumentTokenInspectionSnapshot,
  InspectionCascade,
  InspectionDiagnostic,
  InspectionDiagnosticCode,
  InspectionRevision,
  InspectionSnapshot,
  InspectionTargetStatus,
} from "./inspection/browserCssInspection.ts";
