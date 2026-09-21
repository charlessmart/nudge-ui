import type { TextEditRejectionReason } from "../componentSemantics/textBinding.ts";
import type { InlineTextDiagnostic } from "./inlineTextEditor.ts";

export interface InlineTextFeedback {
  readonly message: string;
}

const FEEDBACK_BY_REASON: Record<TextEditRejectionReason, InlineTextFeedback> = {
  "no-text": {
    message: "Cannot edit text - No visible text",
  },
  "no-binding": {
    message: "Cannot edit text - No safe source binding",
  },
  "ambiguous-binding": {
    message: "Cannot edit text - Ambiguous source binding",
  },
  "editing-active": {
    message: "Cannot edit text - Another edit is active",
  },
  "unsafe-target": {
    message: "Cannot edit text - Unsupported text markup",
  },
};

function isTextEditRejectionReason(
  reason: InlineTextDiagnostic["reason"],
): reason is TextEditRejectionReason {
  return reason in FEEDBACK_BY_REASON;
}

export function getInlineTextFeedback(
  diagnostic: InlineTextDiagnostic | null,
): InlineTextFeedback | null {
  if (!diagnostic || diagnostic.status !== "rejected") return null;
  if (!isTextEditRejectionReason(diagnostic.reason)) return null;
  return FEEDBACK_BY_REASON[diagnostic.reason];
}
