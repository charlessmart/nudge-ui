import type { TextEditRejectionReason } from "../componentSemantics/textBinding.ts";
import type { InlineTextDiagnostic } from "./inlineTextEditor.ts";

export interface InlineTextFeedback {
  readonly title: string;
  readonly recovery: string;
}

const FEEDBACK_BY_REASON: Record<TextEditRejectionReason, InlineTextFeedback> = {
  "no-text": {
    title: "Text editing is unavailable for this target.",
    recovery: "Double-click visible text inside a text-bearing element.",
  },
  "no-binding": {
    title: "This text is owned by the application or has no safe binding.",
    recovery: "Use the app's editor, or choose a plain text target that Nudge UI can identify.",
  },
  "ambiguous-binding": {
    title: "This text has more than one possible source binding.",
    recovery: "Choose a less ambiguous text target, or edit the source in code.",
  },
  "editing-active": {
    title: "Another inline text edit is still active.",
    recovery: "Finish or cancel the current edit, then try again.",
  },
  "unsafe-target": {
    title: "This target contains unsupported text markup.",
    recovery: "Double-click plain text outside nested markup or form controls.",
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
