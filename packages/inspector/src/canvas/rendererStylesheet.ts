import {
  PROTOCOL_VERSION,
  getRendererIdentity,
  sendToParent,
  type ReplaceStylesMessage,
  type StructuralProjectionReportMessage,
} from "./frameProtocol.ts";
import { rulesToCssText, type StyleRule } from "../managedStylesheet.ts";
import { notifyBrowserStylesheetChange } from "../inspection/browserCssInspectionRegistry.ts";
import { applyRenderedInstanceProjection, isRenderedInstanceOverride } from "../renderedInstance.ts";
import {
  applyStructuralProjection,
  getStructuralProjectionReports,
  isStructuralChange,
  subscribeStructuralDiagnostics,
} from "../structuralProjection.ts";

const SHEET_ID = "design-tool-styles";

let lastAppliedRevision = -1;
let lastStructuralReportRevision: number | null = null;

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

// The document adapter owns one batched observer. A later reconciliation only
// changes its diagnostic status; it never receives another structural apply.
subscribeStructuralDiagnostics(() => {
  if (lastStructuralReportRevision !== null) {
    sendStructuralProjectionReport(lastStructuralReportRevision);
  }
});

export function getLastAppliedRevision(): number {
  return lastAppliedRevision;
}

export function resetRendererRevision(): void {
  lastAppliedRevision = -1;
  lastStructuralReportRevision = null;
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

  return { valid: true, msg: m as unknown as ReplaceStylesMessage };
}

export function handleReplaceStyles(
  msg: ReplaceStylesMessage,
  projectId: string,
  workspaceId: string,
  cardId: string,
): boolean {
  const validation = validateReplaceStyles(msg, projectId, workspaceId, cardId);
  if (!validation.valid) return false;

  if (msg.revision <= lastAppliedRevision) return false;

  applyRenderedInstanceProjection(document, msg.instanceOverrides);
  applyStructuralProjection(document, msg.structuralChanges);
  lastStructuralReportRevision = msg.revision;
  sendStructuralProjectionReport(msg.revision);

  const el = document.getElementById(SHEET_ID) as HTMLStyleElement | null;
  if (!el) {
    const newEl = document.createElement("style");
    newEl.id = SHEET_ID;
    newEl.setAttribute("data-design-tool", "managed");
    document.head.appendChild(newEl);
    newEl.textContent = msg.css;
    lastAppliedRevision = msg.revision;
    notifyBrowserStylesheetChange(document);
    return true;
  }

  el.textContent = msg.css;
  lastAppliedRevision = msg.revision;
  notifyBrowserStylesheetChange(document);
  return true;
}
