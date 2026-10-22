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
export const PROTOCOL_VERSION = 24;

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
  /** The renderer kept its own route and asks the controller for a card instead. */
  openInCard?: boolean;
}

export interface LinkTargetStateMessage extends RendererMessage {
  type: "link-target-state";
  openInCard: boolean;
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

export type KeyboardShortcutCode = "Backslash" | "Escape" | "KeyI" | "KeyV" | "KeyC" | "KeyP" | "KeyD" | "KeyS";
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

/** Applies the view tools (outlines, explode view, animation markers) inside a renderer. */
export interface DebugViewStateMessage extends RendererMessage {
  type: "debug-view-state";
  state: DebugViewState;
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
  | AppInteractionModifierMessage;

export type ControllerToRendererMessage =
  | ParentReadyMessage
  | ReplaceStylesMessage
  | LinkTargetStateMessage
  | PanModifierMessage
  | MeasureModifierMessage
  | BoardGestureStateMessage
  | InspectorInteractionStateMessage
  | DebugViewStateMessage;

const RENDERER_MESSAGE_TYPES = {
  "renderer-hello": true,
  "frame-ready": true,
  "frame-runtime": true,
  "frame-metadata": true,
  "frame-error": true,
  "projection-applied": true,
  "structural-projection-report": true,
  "rendered-instance-projection-report": true,
  "text-projection-report": true,
  "navigation-intent": true,
  "element-hover": true,
  "element-measure-state": true,
  "element-click": true,
  "inline-text-intent": true,
  "element-deselect": true,
  "element-drag-start": true,
  "element-drag-move": true,
  "element-drag-end": true,
  "element-delete": true,
  "element-nudge": true,
  "history-request": true,
  "inspector-toggle-request": true,
  "inspector-open-request": true,
  "keyboard-shortcut": true,
  "pan-start": true,
  "pan-move": true,
  "pan-end": true,
  "pan-modifier": true,
  "zoom": true,
  "wheel-pan": true,
  "app-interaction-modifier": true,
} satisfies Record<RendererToControllerMessage["type"], true>;

export function isRendererMessageType(type: unknown): type is RendererToControllerMessage["type"] {
  return typeof type === "string" && Object.hasOwn(RENDERER_MESSAGE_TYPES, type);
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
  | LinkTargetStateMessage
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
  | DebugViewStateMessage;

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
    || value === "KeyS";
}

export function isKeyboardShortcutMessage(
  value: unknown,
  identity: FrameIdentity,
): value is KeyboardShortcutMessage {
  if (!isRendererMessageFor(value, identity) || !isProtocolObject(value)) return false;
  if (!hasOnlyKeys(value, [
    "type", "protocolVersion", "projectId", "workspaceId", "cardId", "phase", "code",
  ])) return false;
  return ownValue(value, "type") === "keyboard-shortcut"
    && (ownValue(value, "phase") === "keydown" || ownValue(value, "phase") === "keyup")
    && isKeyboardShortcutCode(ownValue(value, "code"));
}

export function isElementClickMessage(
  value: unknown,
  identity: FrameIdentity,
): value is ElementClickMessage {
  if (!isRendererMessageFor(value, identity) || !isProtocolObject(value)) return false;
  if (!hasOnlyKeys(value, [
    "type", "protocolVersion", "projectId", "workspaceId", "cardId",
    "cid", "selector", "src", "elementId", "file", "line", "component", "additive",
  ])) return false;
  const line = ownValue(value, "line");
  const additive = ownValue(value, "additive");
  return ownValue(value, "type") === "element-click"
    && typeof ownValue(value, "cid") === "string"
    && typeof ownValue(value, "selector") === "string"
    && typeof ownValue(value, "src") === "string"
    && typeof ownValue(value, "elementId") === "string"
    && typeof ownValue(value, "file") === "string"
    && typeof line === "number" && Number.isSafeInteger(line) && line >= 0
    && typeof ownValue(value, "component") === "string"
    && (additive === undefined || typeof additive === "boolean");
}

export function isInlineTextIntentMessage(
  value: unknown,
  identity: FrameIdentity,
): value is InlineTextIntentMessage {
  if (!isRendererMessageFor(value, identity) || !isProtocolObject(value)) return false;
  if (!hasOnlyKeys(value, [
    "type", "protocolVersion", "projectId", "workspaceId", "cardId",
    "intent", "cid", "src", "elementId", "point", "clickCount", "emptyProjectionId",
  ])) return false;
  const intent = ownValue(value, "intent");
  const point = ownValue(value, "point");
  const clickCount = ownValue(value, "clickCount");
  const emptyProjectionId = ownValue(value, "emptyProjectionId");
  return ownValue(value, "type") === "inline-text-intent"
    && (intent === "pointer-down" || intent === "double-click")
    && typeof ownValue(value, "cid") === "string"
    && typeof ownValue(value, "src") === "string"
    && typeof ownValue(value, "elementId") === "string"
    && isProtocolObject(point)
    && hasOnlyKeys(point, ["x", "y"])
    && typeof ownValue(point, "x") === "number" && Number.isFinite(ownValue(point, "x"))
    && typeof ownValue(point, "y") === "number" && Number.isFinite(ownValue(point, "y"))
    && (clickCount === undefined || (typeof clickCount === "number" && Number.isSafeInteger(clickCount) && clickCount >= 0))
    && (emptyProjectionId === undefined || typeof emptyProjectionId === "string");
}

export function isStructuralProjectionReportMessage(
  value: unknown,
  identity: FrameIdentity,
): value is StructuralProjectionReportMessage {
  if (!isRendererMessageFor(value, identity) || !value || typeof value !== "object") return false;
  const message = value as unknown as Record<string, unknown>;
  if (!hasOnlyKeys(message, [
    "type", "protocolVersion", "projectId", "workspaceId", "cardId", "revision", "reports",
  ])) return false;
  return message.type === "structural-projection-report"
    && Number.isSafeInteger(message.revision)
    && (message.revision as number) >= 0
    && Array.isArray(message.reports)
    && message.reports.every(isStructuralProjectionReport);
}

export function isRenderedInstanceProjectionReportMessage(
  value: unknown,
  identity: FrameIdentity,
): value is RenderedInstanceProjectionReportMessage {
  if (!isRendererMessageFor(value, identity) || !value || typeof value !== "object") return false;
  const message = value as unknown as Record<string, unknown>;
  if (!hasOnlyKeys(message, [
    "type", "protocolVersion", "projectId", "workspaceId", "cardId", "revision", "reports",
  ])) return false;
  return message.type === "rendered-instance-projection-report"
    && Number.isSafeInteger(message.revision)
    && (message.revision as number) >= 0
    && Array.isArray(message.reports)
    && message.reports.every(isDocumentProjectionReport);
}

export function isTextProjectionReportMessage(
  value: unknown,
  identity: FrameIdentity,
): value is TextProjectionReportMessage {
  if (!isRendererMessageFor(value, identity) || !isProtocolObject(value)) return false;
  if (!hasOnlyKeys(value, [
    "type", "protocolVersion", "projectId", "workspaceId", "cardId", "revision", "reports",
  ])) return false;
  const type = ownValue(value, "type");
  const revision = ownValue(value, "revision");
  const reports = ownValue(value, "reports");
  return type === "text-projection-report"
    && typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0
    && Array.isArray(reports)
    && reports.every(isTextProjectionReport);
}

export function isProjectionAppliedMessage(
  value: unknown,
  identity: FrameIdentity,
): value is ProjectionAppliedMessage {
  if (!isRendererMessageFor(value, identity) || !isProtocolObject(value)) return false;
  if (!hasOnlyKeys(value, [
    "type", "protocolVersion", "projectId", "workspaceId", "cardId", "revision",
  ])) return false;
  const type = ownValue(value, "type");
  const revision = ownValue(value, "revision");
  return type === "projection-applied"
    && typeof revision === "number"
    && Number.isSafeInteger(revision)
    && revision >= 0;
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

/** Raw JSON object at the renderer postMessage boundary. */
interface ProtocolObject {
  readonly additive?: unknown;
  readonly cardId?: unknown;
  readonly cid?: unknown;
  readonly callsiteId?: unknown;
  readonly framework?: unknown;
  readonly elementId?: unknown;
  readonly file?: unknown;
  readonly line?: unknown;
  readonly intent?: unknown;
  readonly point?: unknown;
  readonly clickCount?: unknown;
  readonly emptyProjectionId?: unknown;
  readonly x?: unknown;
  readonly y?: unknown;
  readonly prop?: unknown;
  readonly projectId?: unknown;
  readonly protocolVersion?: unknown;
  readonly reports?: unknown;
  readonly revision?: unknown;
  readonly type?: unknown;
  readonly selector?: unknown;
  readonly src?: unknown;
  readonly component?: unknown;
  readonly code?: unknown;
  readonly phase?: unknown;
  readonly value?: unknown;
  readonly workspaceId?: unknown;
}

type ProtocolObjectKey = keyof ProtocolObject;

function isProtocolObject(value: unknown): value is ProtocolObject {
  return typeof value === "object" && value !== null;
}

function ownValue(value: ProtocolObject, key: ProtocolObjectKey): unknown {
  switch (key) {
    case "additive": return value.additive;
    case "emptyProjectionId": return value.emptyProjectionId;
    case "cardId": return value.cardId;
    case "cid": return value.cid;
    case "callsiteId": return value.callsiteId;
    case "framework": return value.framework;
    case "elementId": return value.elementId;
    case "file": return value.file;
    case "line": return value.line;
    case "intent": return value.intent;
    case "point": return value.point;
    case "clickCount": return value.clickCount;
    case "x": return value.x;
    case "y": return value.y;
    case "prop": return value.prop;
    case "projectId": return value.projectId;
    case "protocolVersion": return value.protocolVersion;
    case "reports": return value.reports;
    case "revision": return value.revision;
    case "type": return value.type;
    case "selector": return value.selector;
    case "src": return value.src;
    case "component": return value.component;
    case "code": return value.code;
    case "phase": return value.phase;
    case "value": return value.value;
    case "workspaceId": return value.workspaceId;
  }
}

function hasOnlyKeys(value: ProtocolObject, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function sendToParent(msg: FrameProtocolMessage): void {
  window.parent.postMessage(msg, window.location.origin);
}
