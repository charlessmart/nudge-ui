import { describe, expect, it } from "vitest";
import { getInlineTextFeedback } from "./inlineTextFeedback.ts";

describe("getInlineTextFeedback", () => {
  it.each([
    ["no-text", "Cannot edit text - No visible text"],
    ["no-binding", "Cannot edit text - No safe source binding"],
    ["ambiguous-binding", "Cannot edit text - Ambiguous source binding"],
    ["editing-active", "Cannot edit text - Another edit is active"],
    ["unsafe-target", "Cannot edit text - Unsupported text markup"],
  ] as const)("explains %s with concise copy", (reason, message) => {
    const feedback = getInlineTextFeedback({
      kind: "inline-text",
      status: "rejected",
      reason,
      before: "Visible copy",
    });

    expect(feedback).toEqual({ message });
    expect(message.replace(/\s-\s/g, " ").trim().split(/\s+/).length).toBeLessThanOrEqual(7);
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
