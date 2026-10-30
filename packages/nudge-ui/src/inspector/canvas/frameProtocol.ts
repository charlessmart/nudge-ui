import { isDocumentProjectionReport } from "../projection/renderedInstance.ts";
import { isTextProjectionReport } from "../projection/textProjection.ts";
import { isStructuralProjectionReport } from "../projection/structuralProjectionBoundary.ts";
import type { ComponentOverride } from "../componentSemantics/types.ts";
import type { RenderedInstanceOverride } from "../changes/editModel.ts";
import type { NudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import type { SpacingDescriptor } from "../overlay/spacingGestures.ts";
import type { RendererCursor } from "../ui/customCursors.ts";
import type { DebugViewState } from "./debugView.ts";

// Bumped on every message-shape change; the controller and renderer must agree exactly.
export const PROTOCOL_VERSION = 26;

export interface FrameMessage {
  type: string;
  protocolVersion: number;
}

/** Pre-identity solicitation from a renderer that missed parent-ready; carries no FrameIdentity. */
export interface RendererHelloMessage extends FrameMessage {
  type: "renderer-hello";
}

export interface FrameIdentity {
  projectId: string;
  workspaceId: string;
  cardId: string;
}

export interface ParentReadyMessage extends FrameMessage {
  type: "parent-ready";
  projectId: string;
  workspaceId: string;
  cardId: string;
}

export interface RendererMessage extends FrameMessage, FrameIdentity {}

export interface FrameReadyMessage extends RendererMessage {
  type: "frame-ready";
  url: string;
  title: string;
  runtime: NudgeUiRuntimeConfig;
}

export interface FrameRuntimeMessage extends RendererMessage {
  type: "frame-runtime";
  runtime: NudgeUiRuntimeConfig;
}

export interface FrameMetadataMessage extends RendererMessage {
  type: "frame-metadata";
  url?: string;
  title?: string;
}

export interface FrameLoadError extends RendererMessage {
  type: "frame-error";
  message: string;
}

export interface ReplaceStylesMessage extends FrameMessage {
  type: "replace-styles";
  projectId: string;
  workspaceId: string;
  cardId: string;
  css: string;
  revision: number;
  /** Controller-owned durable targets; the renderer derives local markers. */
  instanceOverrides: RenderedInstanceOverride[];
  /** Controller-owned structural intent; renderers never own this change log. */
  structuralChanges: import("../projection/structuralProjection.ts").StructuralChange[];
  textContentChanges: import("../changes/types.ts").TextContentChangeRecord[];
  componentOverrides: ComponentOverride[];
  /** Generated identities the edits refer to; omitted while edits are hidden. */
  runtimeIdentities?: import("../runtime/runtimeIdentityClaims.ts").RuntimeIdentityClaim[];
}

export interface ProjectionAppliedMessage extends RendererMessage {
  type: "projection-applied";
  revision: number;
}

/** Diagnostics only: accepting these never changes controller-owned structural intent. */
export interface StructuralProjectionReportMessage extends RendererMessage {
  type: "structural-projection-report";
  revision: number;
  reports: import("../projection/structuralProjection.ts").StructuralProjectionReport[];
}

export interface RenderedInstanceProjectionReportMessage extends RendererMessage {
  type: "rendered-instance-projection-report";
  revision: number;
  reports: import("../projection/renderedInstance.ts").DocumentProjectionReport[];
}

export interface TextProjectionReportMessage extends RendererMessage {
  type: "text-projection-report";
  revision: number;
  reports: import("../projection/textProjection.ts").TextProjectionReport[];
}

export interface NavigationIntentMessage extends RendererMessage {
  type: "navigation-intent";
  url: string;
}

/** The link under the pointer, or a clear when the pointer leaves it. */
export interface LinkPreviewMessage extends RendererMessage {
  type: "link-preview";
  url: string | null;
  rect: { left: number; top: number; width: number; height: number } | null;
  /** Last pointer position, in renderer viewport coordinates. */
  point?: { x: number; y: number } | null;
}

export interface LinkPreviewStateMessage extends RendererMessage {
  type: "link-preview-state";
  enabled: boolean;
}

export interface ElementHoverMessage extends RendererMessage {
  type: "element-hover";
  cid: string;
  selector: string;
  src: string;
  elementId: string;
  rect: { left: number; top: number; width: number; height: number } | null;
  margins: { top: number; right: number; bottom: number; left: number } | null;
  borders: { top: number; right: number; bottom: number; left: number } | null;
  /** Last pointer position in the renderer viewport, used for spacing guides. */
  point?: { x: number; y: number } | null;
  /** The spacing handle under the pointer; only present inside the handle hit area. */
  spacing?: SpacingDescriptor | null;
  /** The padding bar or layout gap area under the pointer, regardless of the handle. */
  hoverSpacing?: SpacingDescriptor | null;
}

/** The parent never infers modifier state: focus lives in the iframe. */
export interface ElementMeasureStateMessage extends RendererMessage {
  type: "element-measure-state";
  altKey: boolean;
  pointerOverPage: boolean;
}

export interface ElementClickMessage extends RendererMessage {
  type: "element-click";
  cid: string;
  selector: string;
  src: string;
  elementId: string;
  file: string;
  line: number;
  component: string;
  /** True for a Shift-click that toggles this target in the selection group. */
  additive?: boolean;
}

export interface InlineTextIntentMessage extends RendererMessage {
  type: "inline-text-intent";
  intent: "pointer-down" | "double-click";
  cid: string;
  src: string;
  elementId: string;
  point: { x: number; y: number };
  clickCount?: number;
  emptyProjectionId?: string;
}

export interface ElementDeselectMessage extends RendererMessage {
  type: "element-deselect";
}

export interface ElementDragStartMessage extends RendererMessage {
  type: "element-drag-start";
  cid: string;
  src: string;
  elementId: string;
  point: { x: number; y: number };
  /** Original pointer position; the current point may already be outside the affordance. */
  startPoint?: { x: number; y: number };
  /** Spacing affordance captured at pointer-down, if this is a spacing drag. */
  spacing?: SpacingDescriptor | null;
  /** True while Shift is held; spacing drags use this to snap by 8px steps. */
  shiftKey?: boolean;
}

export interface ElementDragMoveMessage extends RendererMessage {
  type: "element-drag-move";
  point: { x: number; y: number };
  shiftKey?: boolean;
}

export interface ElementDragEndMessage extends RendererMessage {
  type: "element-drag-end";
  point: { x: number; y: number };
  shiftKey?: boolean;
  /** True when the renderer lost the gesture before the pointer was released. */
  cancelled?: boolean;
}

export interface ElementDeleteMessage extends RendererMessage {
  type: "element-delete";
  cid: string;
  src: string;
  elementId: string;
}

export interface ElementNudgeMessage extends RendererMessage {
  type: "element-nudge";
  cid: string;
  src: string;
  elementId: string;
  key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";
}

/** A renderer may request history navigation; only the parent changes history. */
export interface HistoryRequestMessage extends RendererMessage {
  type: "history-request";
  action: "undo" | "redo";
}

export interface InspectorToggleRequestMessage extends RendererMessage {
  type: "inspector-toggle-request";
}

/** Requests that the parent-owned inspector be open without toggling it closed. */
export interface InspectorOpenRequestMessage extends RendererMessage {
  type: "inspector-open-request";
}

export type KeyboardShortcutCode = "Backslash" | "Escape" | "KeyV" | "KeyC" | "KeyP" | "KeyD" | "KeyO" | "KeyX" | "KeyS";
export type KeyboardShortcutPhase = "keydown" | "keyup";

export interface KeyboardShortcutMessage extends RendererMessage {
  type: "keyboard-shortcut";
  phase: KeyboardShortcutPhase;
  code: KeyboardShortcutCode;
}

export interface PanStartMessage extends RendererMessage {
  type: "pan-start";
  point: { x: number; y: number };
}

export interface PanMoveMessage extends RendererMessage {
  type: "pan-move";
  point: { x: number; y: number };
}

export interface PanEndMessage extends RendererMessage {
  type: "pan-end";
}

/** Keeps iframe pointer handling in sync when Space is held in the controller. */
export interface PanModifierMessage extends RendererMessage {
  type: "pan-modifier";
  spaceHeld: boolean;
}

/** Keeps iframe measurement state synchronized when focus is in the parent. */
export interface MeasureModifierMessage extends RendererMessage {
  type: "measure-modifier";
  altKey: boolean;
}

/** Enables board-only pan and zoom interception inside a mounted preview. */
export interface BoardGestureStateMessage extends RendererMessage {
  type: "board-gesture-state";
  enabled: boolean;
  /** Ordinary wheel gestures pan the board instead of scrolling the app. */
  panScroll?: boolean;
  /** Holding Space turns a drag into a board pan while the app keeps native wheel input. */
  spacePan?: boolean;
}

export interface ZoomMessage extends RendererMessage {
  type: "zoom";
  deltaY: number;
  point: { x: number; y: number };
}

export interface WheelPanMessage extends RendererMessage {
  type: "wheel-pan";
  deltaX: number;
  deltaY: number;
}

/** Keeps the A key state synchronized when keyboard focus moves into an iframe. */
export interface AppInteractionModifierMessage extends RendererMessage {
  type: "app-interaction-modifier";
  held: boolean;
}

export interface InspectorInteractionStateMessage extends RendererMessage {
  type: "inspector-interaction-state";
  open: boolean;
  interactionsEnabled: boolean;
  cursor: RendererCursor;
  /** CSS cursor for the Comment tool; the controller renders it. */
  commentCursor?: string;
}

/** Applies the Inspection tool (outlines, explode view, animation speed) inside a renderer. */
export interface DebugViewStateMessage extends RendererMessage {
  type: "debug-view-state";
  state: DebugViewState;
}

/** Plays every animation on the page again from its start. */
export interface AnimationReplayMessage extends RendererMessage {
  type: "animation-replay";
}

/** Explode view pulled a subtree apart in this renderer. The controller hides its own element chrome meanwhile, since a flat overlay cannot follow the exploded layers. */
export interface DebugViewPhaseMessage extends RendererMessage {
  type: "debug-view-phase";
  /** True from the moment a subtree explodes until it has finished collapsing. */
  exploded: boolean;
}

export type RendererToControllerMessage =
  | RendererHelloMessage
  | FrameReadyMessage
  | FrameRuntimeMessage
  | FrameMetadataMessage
  | FrameLoadError
  | ProjectionAppliedMessage
  | StructuralProjectionReportMessage
  | RenderedInstanceProjectionReportMessage
  | TextProjectionReportMessage
  | NavigationIntentMessage
  | LinkPreviewMessage
  | ElementHoverMessage
  | ElementMeasureStateMessage
  | ElementClickMessage
  | InlineTextIntentMessage
  | ElementDeselectMessage
  | ElementDragStartMessage
  | ElementDragMoveMessage
  | ElementDragEndMessage
  | ElementDeleteMessage
  | ElementNudgeMessage
  | HistoryRequestMessage
  | InspectorToggleRequestMessage
  | InspectorOpenRequestMessage
  | KeyboardShortcutMessage
  | PanStartMessage
  | PanMoveMessage
  | PanEndMessage
  | PanModifierMessage
  | ZoomMessage
  | WheelPanMessage
  | AppInteractionModifierMessage
  | DebugViewPhaseMessage;

export type ControllerToRendererMessage =
  | ParentReadyMessage
  | ReplaceStylesMessage
  | LinkPreviewStateMessage
  | PanModifierMessage
  | MeasureModifierMessage
  | BoardGestureStateMessage
  | InspectorInteractionStateMessage
  | DebugViewStateMessage
  | AnimationReplayMessage;

/** One message's payload rule: the keys it may carry beyond the shared envelope, and how to check them. */
interface MessageSchema {
  /** Extra keys this message may carry; `null` while its reader still narrows by hand. */
  readonly fields: readonly string[] | null;
  readonly validate?: (value: ProtocolObject) => boolean;
}

const ENVELOPE_KEYS = ["type", "protocolVersion", "projectId", "workspaceId", "cardId"] as const;

function isRevision(value: ProtocolObject): boolean {
  const revision = ownValue(value, "revision");
  return typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0;
}

function isReportList(value: ProtocolObject, check: (candidate: unknown) => boolean): boolean {
  const reports = ownValue(value, "reports");
  return Array.isArray(reports) && reports.every(check);
}

/**
 * One entry per renderer message. The union above is the type; this table is the runtime contract. Adding a message
 * means adding a type and one entry here, and the `satisfies` clause fails until both exist.
 */
const RENDERER_SCHEMAS = {
  "renderer-hello": { fields: null },
  "frame-ready": { fields: null },
  "frame-runtime": { fields: null },
  "frame-metadata": { fields: null },
  "frame-error": { fields: null },
  "projection-applied": { fields: ["revision"], validate: isRevision },
  "structural-projection-report": {
    fields: ["revision", "reports"],
    validate: (value) => isRevision(value) && isReportList(value, isStructuralProjectionReport),
  },
  "rendered-instance-projection-report": {
    fields: ["revision", "reports"],
    validate: (value) => isRevision(value) && isReportList(value, isDocumentProjectionReport),
  },
  "text-projection-report": {
    fields: ["revision", "reports"],
    validate: (value) => isRevision(value) && isReportList(value, isTextProjectionReport),
  },
  "navigation-intent": { fields: null },
  "link-preview": { fields: null },
  "element-hover": { fields: null },
  "element-measure-state": { fields: null },
  "element-click": {
    fields: ["cid", "selector", "src", "elementId", "file", "line", "component", "additive"],
    validate: (value) => {
      const line = ownValue(value, "line");
      const additive = ownValue(value, "additive");
      return typeof ownValue(value, "cid") === "string"
        && typeof ownValue(value, "selector") === "string"
        && typeof ownValue(value, "src") === "string"
        && typeof ownValue(value, "elementId") === "string"
        && typeof ownValue(value, "file") === "string"
        && typeof line === "number" && Number.isSafeInteger(line) && line >= 0
        && typeof ownValue(value, "component") === "string"
        && (additive === undefined || typeof additive === "boolean");
    },
  },
  "inline-text-intent": {
    fields: ["intent", "cid", "src", "elementId", "point", "clickCount", "emptyProjectionId"],
    validate: (value) => {
      const intent = ownValue(value, "intent");
      const point = ownValue(value, "point");
      const clickCount = ownValue(value, "clickCount");
      const emptyProjectionId = ownValue(value, "emptyProjectionId");
      return (intent === "pointer-down" || intent === "double-click")
        && typeof ownValue(value, "cid") === "string"
        && typeof ownValue(value, "src") === "string"
        && typeof ownValue(value, "elementId") === "string"
        && isProtocolObject(point)
        && hasOnlyKeys(point, ["x", "y"])
        && typeof ownValue(point, "x") === "number" && Number.isFinite(ownValue(point, "x"))
        && typeof ownValue(point, "y") === "number" && Number.isFinite(ownValue(point, "y"))
        && (clickCount === undefined || (typeof clickCount === "number" && Number.isSafeInteger(clickCount) && clickCount >= 0))
        && (emptyProjectionId === undefined || typeof emptyProjectionId === "string");
    },
  },
  "element-deselect": { fields: null },
  "element-drag-start": { fields: null },
  "element-drag-move": { fields: null },
  "element-drag-end": { fields: null },
  "element-delete": { fields: null },
  "element-nudge": { fields: null },
  "history-request": { fields: null },
  "inspector-toggle-request": { fields: null },
  "inspector-open-request": { fields: null },
  "keyboard-shortcut": {
    fields: ["phase", "code"],
    validate: (value) => (ownValue(value, "phase") === "keydown" || ownValue(value, "phase") === "keyup")
      && isKeyboardShortcutCode(ownValue(value, "code")),
  },
  "pan-start": { fields: null },
  "pan-move": { fields: null },
  "pan-end": { fields: null },
  "pan-modifier": { fields: null },
  "zoom": { fields: null },
  "wheel-pan": { fields: null },
  "app-interaction-modifier": { fields: null },
  "debug-view-phase": {
    fields: ["exploded"],
    validate: (value) => typeof ownValue(value, "exploded") === "boolean",
  },
} satisfies Record<RendererToControllerMessage["type"], MessageSchema>;

export function isRendererMessageType(type: unknown): type is RendererToControllerMessage["type"] {
  return typeof type === "string" && Object.hasOwn(RENDERER_SCHEMAS, type);
}

function isMessageOfType<K extends RendererToControllerMessage["type"]>(
  value: unknown,
  identity: FrameIdentity,
  type: K,
): value is Extract<RendererToControllerMessage, { type: K }> {
  if (!isRendererMessageFor(value, identity) || !isProtocolObject(value)) return false;
  if (ownValue(value, "type") !== type) return false;
  const schema: MessageSchema = RENDERER_SCHEMAS[type];
  if (schema.fields && !hasOnlyKeys(value, [...ENVELOPE_KEYS, ...schema.fields])) return false;
  return schema.validate === undefined || schema.validate(value);
}

export type FrameProtocolMessage =
  | ParentReadyMessage
  | RendererHelloMessage
  | FrameReadyMessage
  | FrameRuntimeMessage
  | FrameMetadataMessage
  | FrameLoadError
  | ReplaceStylesMessage
  | ProjectionAppliedMessage
  | StructuralProjectionReportMessage
  | RenderedInstanceProjectionReportMessage
  | TextProjectionReportMessage
  | NavigationIntentMessage
  | LinkPreviewMessage
  | LinkPreviewStateMessage
  | ElementHoverMessage
  | ElementMeasureStateMessage
  | ElementClickMessage
  | InlineTextIntentMessage
  | ElementDeselectMessage
  | ElementDragStartMessage
  | ElementDragMoveMessage
  | ElementDragEndMessage
  | ElementDeleteMessage
  | ElementNudgeMessage
  | HistoryRequestMessage
  | InspectorToggleRequestMessage
  | InspectorOpenRequestMessage
  | KeyboardShortcutMessage
  | PanStartMessage
  | PanMoveMessage
  | PanEndMessage
  | PanModifierMessage
  | MeasureModifierMessage
  | BoardGestureStateMessage
  | ZoomMessage
  | WheelPanMessage
  | AppInteractionModifierMessage
  | InspectorInteractionStateMessage
  | DebugViewPhaseMessage
  | DebugViewStateMessage
  | AnimationReplayMessage;

let rendererIdentity: FrameIdentity | null = null;

export function setRendererIdentity(identity: FrameIdentity): void {
  rendererIdentity = identity;
}

export function clearRendererIdentity(expected?: FrameIdentity): void {
  if (expected === undefined || rendererIdentity === expected) rendererIdentity = null;
}

export function getRendererIdentity(): FrameIdentity | null {
  return rendererIdentity;
}

export function isRendererMessageFor(
  value: unknown,
  identity: FrameIdentity,
): value is RendererMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<RendererMessage>;
  return message.protocolVersion === PROTOCOL_VERSION
    && message.projectId === identity.projectId
    && message.workspaceId === identity.workspaceId
    && message.cardId === identity.cardId;
}

export function isKeyboardShortcutCode(value: unknown): value is KeyboardShortcutCode {
  return value === "Backslash"
    || value === "Escape"
    || value === "KeyV"
    || value === "KeyC"
    || value === "KeyP"
    || value === "KeyD"
    || value === "KeyO"
    || value === "KeyX"
    || value === "KeyS";
}

export function isKeyboardShortcutMessage(
  value: unknown,
  identity: FrameIdentity,
): value is KeyboardShortcutMessage {
  return isMessageOfType(value, identity, "keyboard-shortcut");
}

export function isDebugViewPhaseMessage(
  value: unknown,
  identity: FrameIdentity,
): value is DebugViewPhaseMessage {
  return isMessageOfType(value, identity, "debug-view-phase");
}

export function isElementClickMessage(
  value: unknown,
  identity: FrameIdentity,
): value is ElementClickMessage {
  return isMessageOfType(value, identity, "element-click");
}

export function isInlineTextIntentMessage(
  value: unknown,
  identity: FrameIdentity,
): value is InlineTextIntentMessage {
  return isMessageOfType(value, identity, "inline-text-intent");
}

export function isStructuralProjectionReportMessage(
  value: unknown,
  identity: FrameIdentity,
): value is StructuralProjectionReportMessage {
  return isMessageOfType(value, identity, "structural-projection-report");
}

export function isRenderedInstanceProjectionReportMessage(
  value: unknown,
  identity: FrameIdentity,
): value is RenderedInstanceProjectionReportMessage {
  return isMessageOfType(value, identity, "rendered-instance-projection-report");
}

export function isTextProjectionReportMessage(
  value: unknown,
  identity: FrameIdentity,
): value is TextProjectionReportMessage {
  return isMessageOfType(value, identity, "text-projection-report");
}

export function isProjectionAppliedMessage(
  value: unknown,
  identity: FrameIdentity,
): value is ProjectionAppliedMessage {
  return isMessageOfType(value, identity, "projection-applied");
}

export function isComponentOverrideList(value: unknown): value is ComponentOverride[] {
  if (!Array.isArray(value)) return false;
  return value.every((candidate) => {
    if (!isProtocolObject(candidate)
      || !hasOnlyKeys(candidate, ["framework", "callsiteId", "prop", "value"])) return false;
    const framework = ownValue(candidate, "framework");
    const callsiteId = ownValue(candidate, "callsiteId");
    const prop = ownValue(candidate, "prop");
    const overrideValue = ownValue(candidate, "value");
    return framework === "react"
      && typeof callsiteId === "string" && callsiteId.length > 0
      && typeof prop === "string" && prop.length > 0
      && (typeof overrideValue === "string"
        || typeof overrideValue === "number" && Number.isFinite(overrideValue)
        || typeof overrideValue === "boolean");
  });
}

/** Raw JSON object at the renderer postMessage boundary: unvalidated until a schema accepts it. */
type ProtocolObject = Readonly<Record<string, unknown>>;

function isProtocolObject(value: unknown): value is ProtocolObject {
  return typeof value === "object" && value !== null;
}

function ownValue(value: ProtocolObject, key: string): unknown {
  return value[key];
}

function hasOnlyKeys(value: ProtocolObject, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function sendToParent(msg: FrameProtocolMessage): void {
  window.parent.postMessage(msg, window.location.origin);
}
