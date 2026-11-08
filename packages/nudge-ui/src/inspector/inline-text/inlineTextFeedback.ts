import type { TextEditRejectionReason } from "../componentSemantics/textBinding.ts";
import type { InlineTextDiagnostic } from "./inlineTextEditor.ts";

export interface InlineTextFeedback {
  readonly message: string;
}

/** Each message says why the edit was refused, then what to do instead. */
const FEEDBACK_BY_REASON = {
  "no-text": {
    message: "Can't edit: no text here. Double-click the words instead.",
  },
  "no-binding": {
    message: "Can't edit: this text isn't traced to your source. Change it in your code.",
  },
  "ambiguous-binding": {
    message: "Can't edit: this text renders in several places. Change it in your code.",
  },
  "editing-active": {
    message: "Can't edit yet: finish the open text edit first.",
  },
  "unsafe-target": {
    message: "Can't edit: this text contains other markup. Change it in your code.",
  },
} satisfies Record<TextEditRejectionReason, InlineTextFeedback>;

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
