import {
  PROTOCOL_VERSION,
  getRendererIdentity,
  sendToParent,
  type ReplaceStylesMessage,
  type ProjectionAppliedMessage,
  type RenderedInstanceProjectionReportMessage,
  type StructuralProjectionReportMessage,
  type TextProjectionReportMessage,
} from "./frameProtocol.ts";
import { isComponentOverrideList } from "./frameProtocol.ts";
import { isNudgeUiDev } from "../devFlag.ts";
import { replaceComponentOverrideProjection } from "../componentSemantics/index.ts";
import { notifyBrowserStylesheetChange } from "../inspection/browserCssInspectionRegistry.ts";
import {
  applyRenderedInstanceProjection,
  getRenderedInstanceProjectionReports,
  isRenderedInstanceOverride,
  subscribeRenderedInstanceDiagnostics,
} from "../renderedInstance.ts";
import {
  applyStructuralProjection,
  getStructuralProjectionReports,
  isStructuralChange,
  subscribeStructuralDiagnostics,
} from "../structuralProjection.ts";
import {
  applyTextContentProjection,
  getTextProjectionReports,
  subscribeTextProjectionDiagnostics,
} from "../textProjection.ts";
import { isTextContentChangeListValue } from "../changes/types.ts";
import {
  applyWorkspaceProjection,
  type DocumentProjectionAdapter,
  type SerializedManagedStyles,
  type WorkspaceProjectionPlan,
} from "../projection/workspaceProjection.ts";

const SHEET_ID = "nudge-ui-styles";

function replaceRendererCss(css: string): void {
  let sheet = document.getElementById(SHEET_ID) as HTMLStyleElement | null;
  if (!sheet) {
    sheet = document.createElement("style");
    sheet.id = SHEET_ID;
    sheet.setAttribute("data-nudge-ui", "managed");
    document.head.appendChild(sheet);
  }
  sheet.textContent = css;
  notifyBrowserStylesheetChange(document);
}

const rendererDocumentProjectionAdapter: DocumentProjectionAdapter<SerializedManagedStyles> = {
  applyStructural: (changes) => {
    applyStructuralProjection(document, changes);
  },
  applyRenderedInstances: (overrides) => {
    applyRenderedInstanceProjection(document, overrides);
  },
  applyText: (changes) => {
    applyTextContentProjection(document, changes);
  },
  applyComponents: replaceComponentOverrideProjection,
  applyManagedStyles: (styles) => {
    replaceRendererCss(styles.css);
  },
};

function projectionFromReplaceStylesMessage(
  msg: ReplaceStylesMessage,
): WorkspaceProjectionPlan<SerializedManagedStyles> {
  return {
    sourceRevision: msg.revision,
    managedStyles: { css: msg.css },
    instanceOverrides: msg.instanceOverrides,
    structuralChanges: msg.structuralChanges,
    textContentChanges: msg.textContentChanges,
    componentOverrides: msg.componentOverrides,
  };
}

let lastAppliedRevision = -1;
let lastStructuralReportRevision: number | null = null;
let lastRenderedInstanceReportRevision: number | null = null;
let lastTextProjectionReportRevision: number | null = null;
let stopStructuralDiagnostics: (() => void) | null = null;
let stopRenderedInstanceDiagnostics: (() => void) | null = null;
let stopTextProjectionDiagnostics: (() => void) | null = null;

function sendStructuralProjectionReport(revision: number): void {
  const identity = getRendererIdentity();
  if (!identity) return;
  const msg: StructuralProjectionReportMessage = {
    type: "structural-projection-report",
    protocolVersion: PROTOCOL_VERSION,
    revision,
    reports: getStructuralProjectionReports(document).map((report) => ({ ...report })),
    ...identity,
  };
  sendToParent(msg);
}

function sendRenderedInstanceProjectionReport(revision: number): void {
  const identity = getRendererIdentity();
  if (!identity) return;
  const msg: RenderedInstanceProjectionReportMessage = {
    type: "rendered-instance-projection-report",
    protocolVersion: PROTOCOL_VERSION,
    revision,
    reports: getRenderedInstanceProjectionReports(document).map((report) => ({ ...report })),
    ...identity,
  };
  sendToParent(msg);
}

function sendTextProjectionReport(revision: number): void {
  const identity = getRendererIdentity();
  if (!identity) return;
  const msg: TextProjectionReportMessage = {
    type: "text-projection-report",
    protocolVersion: PROTOCOL_VERSION,
    revision,
    reports: getTextProjectionReports(document).map((report) => ({ ...report })),
    ...identity,
  };
  sendToParent(msg);
}

function sendProjectionApplied(revision: number): void {
  const identity = getRendererIdentity();
  if (!identity) return;
  const msg: ProjectionAppliedMessage = {
    type: "projection-applied",
    protocolVersion: PROTOCOL_VERSION,
    revision,
    ...identity,
  };
  sendToParent(msg);
}

/** Installs renderer diagnostics only after the dev-only renderer bootstrap. */
export function startRendererProjectionDiagnostics(): void {
  if (!isNudgeUiDev() || stopStructuralDiagnostics || stopRenderedInstanceDiagnostics || stopTextProjectionDiagnostics) return;
  stopStructuralDiagnostics = subscribeStructuralDiagnostics(() => {
    if (lastStructuralReportRevision !== null) {
      sendStructuralProjectionReport(lastStructuralReportRevision);
    }
  });
  stopRenderedInstanceDiagnostics = subscribeRenderedInstanceDiagnostics(() => {
    if (lastRenderedInstanceReportRevision !== null) {
      sendRenderedInstanceProjectionReport(lastRenderedInstanceReportRevision);
    }
  });
  stopTextProjectionDiagnostics = subscribeTextProjectionDiagnostics(() => {
    if (lastTextProjectionReportRevision !== null) {
      sendTextProjectionReport(lastTextProjectionReportRevision);
    }
  });
}

export function getLastAppliedRevision(): number {
  return lastAppliedRevision;
}

export function resetRendererRevision(): void {
  lastAppliedRevision = -1;
  lastStructuralReportRevision = null;
  lastRenderedInstanceReportRevision = null;
  lastTextProjectionReportRevision = null;
  stopStructuralDiagnostics?.();
  stopStructuralDiagnostics = null;
  stopRenderedInstanceDiagnostics?.();
  stopRenderedInstanceDiagnostics = null;
  stopTextProjectionDiagnostics?.();
  stopTextProjectionDiagnostics = null;
}

export interface ReplaceStylesValidation {
  valid: true;
  msg: ReplaceStylesMessage;
}

export interface ReplaceStylesRejection {
  valid: false;
  reason: string;
}

export type ReplaceStylesResult = ReplaceStylesValidation | ReplaceStylesRejection;

export function validateReplaceStyles(
  msg: unknown,
  projectId: string,
  workspaceId: string,
  cardId: string,
): ReplaceStylesResult {
  if (!msg || typeof msg !== "object") {
    return { valid: false, reason: "message is not an object" };
  }

  const m = msg as Record<string, unknown>;

  if (typeof m.protocolVersion !== "number" || m.protocolVersion !== PROTOCOL_VERSION) {
    return { valid: false, reason: "protocol version mismatch" };
  }

  if (m.type !== "replace-styles") {
    return { valid: false, reason: "not a replace-styles message" };
  }

  if (typeof m.projectId !== "string" || m.projectId !== projectId) {
    return { valid: false, reason: "project ID mismatch" };
  }

  if (typeof m.workspaceId !== "string" || m.workspaceId !== workspaceId) {
    return { valid: false, reason: "workspace ID mismatch" };
  }

  if (typeof m.cardId !== "string" || m.cardId !== cardId) {
    return { valid: false, reason: "card ID mismatch" };
  }

  if (typeof m.revision !== "number" || !Number.isSafeInteger(m.revision) || m.revision < 0) {
    return { valid: false, reason: "revision is not a non-negative safe integer" };
  }

  if (typeof m.css !== "string") {
    return { valid: false, reason: "css is not a string" };
  }

  if (!Array.isArray(m.instanceOverrides) || !m.instanceOverrides.every(isRenderedInstanceOverride)) {
    return { valid: false, reason: "instance overrides are invalid" };
  }

  if (!Array.isArray(m.structuralChanges) || !m.structuralChanges.every(isStructuralChange)) {
    return { valid: false, reason: "structural changes are invalid" };
  }

  if (!isTextContentChangeListValue(m.textContentChanges)) {
    return { valid: false, reason: "text content changes are invalid" };
  }

  if (!isComponentOverrideList(m.componentOverrides)) {
    return { valid: false, reason: "component overrides are invalid" };
  }

  return { valid: true, msg: m as unknown as ReplaceStylesMessage };
}

export function handleReplaceStyles(
  msg: ReplaceStylesMessage,
  projectId: string,
  workspaceId: string,
  cardId: string,
): boolean {
  if (!isNudgeUiDev()) return false;
  const validation = validateReplaceStyles(msg, projectId, workspaceId, cardId);
  if (!validation.valid) return false;

  if (msg.revision <= lastAppliedRevision) return false;

  applyWorkspaceProjection(
    rendererDocumentProjectionAdapter,
    projectionFromReplaceStylesMessage(msg),
  );
  lastStructuralReportRevision = msg.revision;
  lastRenderedInstanceReportRevision = msg.revision;
  lastTextProjectionReportRevision = msg.revision;
  sendStructuralProjectionReport(msg.revision);
  sendRenderedInstanceProjectionReport(msg.revision);
  sendTextProjectionReport(msg.revision);

  lastAppliedRevision = msg.revision;
  sendProjectionApplied(msg.revision);
  return true;
}
