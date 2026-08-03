import { PROTOCOL_VERSION, type ReplaceStylesMessage } from "./frameProtocol.ts";
import { rulesToCssText, type StyleRule } from "../managedStylesheet.ts";
import { getBrowserCssInspection } from "../inspection/browserCssInspectionRegistry.ts";

const SHEET_ID = "design-tool-styles";

function notifyStylesheetChange(doc: Document = document): void {
  getBrowserCssInspection(doc).notifyStylesheetChange();
}

let lastAppliedRevision = -1;

export function getLastAppliedRevision(): number {
  return lastAppliedRevision;
}

export function resetRendererRevision(): void {
  lastAppliedRevision = -1;
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

  const el = document.getElementById(SHEET_ID) as HTMLStyleElement | null;
  if (!el) {
    const newEl = document.createElement("style");
    newEl.id = SHEET_ID;
    newEl.setAttribute("data-design-tool", "managed");
    document.head.appendChild(newEl);
    newEl.textContent = msg.css;
    lastAppliedRevision = msg.revision;
    notifyStylesheetChange(document);
    return true;
  }

  el.textContent = msg.css;
  lastAppliedRevision = msg.revision;
  notifyStylesheetChange(document);
  return true;
}
