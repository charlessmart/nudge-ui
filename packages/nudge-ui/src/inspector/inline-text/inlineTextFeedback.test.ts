import { describe, expect, it } from "vitest";
import { getInlineTextFeedback } from "./inlineTextFeedback.ts";

describe("getInlineTextFeedback", () => {
  it.each([
    ["no-text", "Text editing is unavailable for this target."],
    ["no-binding", "This text is owned by the application or has no safe binding."],
    ["ambiguous-binding", "This text has more than one possible source binding."],
    ["editing-active", "Another inline text edit is still active."],
    ["unsafe-target", "This target contains unsupported text markup."],
  ] as const)("explains %s with a recovery action", (reason, title) => {
    const feedback = getInlineTextFeedback({
      kind: "inline-text",
      status: "rejected",
      reason,
      before: "Visible copy",
    });

    expect(feedback).toMatchObject({ title });
    expect(feedback?.recovery).toBeTruthy();
  });

  it.each([
    { status: "started", reason: "start" },
    { status: "committed", reason: "commit" },
    { status: "cancelled", reason: "cancel" },
  ] as const)("does not announce a non-rejection diagnostic (%s)", (diagnostic) => {
    expect(getInlineTextFeedback({
      kind: "inline-text",
      ...diagnostic,
      before: "Visible copy",
    })).toBeNull();
  });
});
