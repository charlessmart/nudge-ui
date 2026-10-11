import { expect, it } from "vitest";
import { withPromptContext } from "./promptDocument.ts";

it("keeps one leading title when a sketch-only prompt has no text changes", () => {
  expect(withPromptContext(["Page: https://example.com/"], "# Requested design changes"))
    .toBe("# Requested design changes\n\nPage: https://example.com/");
});
