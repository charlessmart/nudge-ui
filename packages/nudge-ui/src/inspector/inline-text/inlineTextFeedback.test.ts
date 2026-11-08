import { describe, expect, it } from "vitest";
import { getInlineTextFeedback } from "./inlineTextFeedback.ts";

describe("getInlineTextFeedback", () => {
  it.each([
    ["no-text", "Can't edit: no text here. Double-click the words instead."],
    ["no-binding", "Can't edit: this text isn't traced to your source. Change it in your code."],
    ["ambiguous-binding", "Can't edit: this text renders in several places. Change it in your code."],
    ["editing-active", "Can't edit yet: finish the open text edit first."],
    ["unsafe-target", "Can't edit: this text contains other markup. Change it in your code."],
  ] as const)("explains %s and what to do instead, concisely", (reason, message) => {
    const feedback = getInlineTextFeedback({
      kind: "inline-text",
      status: "rejected",
      reason,
      before: "Visible copy",
    });

    expect(feedback).toEqual({ message });
    expect(message.trim().split(/\s+/).length).toBeLessThanOrEqual(14);
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
