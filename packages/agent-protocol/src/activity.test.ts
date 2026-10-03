import { describe, expect, it } from "vitest";
import { isAgentActivity } from "./index.ts";
describe("activity protocol", () => {
  it("accepts a bounded source range for a request", () => {
    expect(isAgentActivity({ requestId: "request", file: "src/Card.tsx", operation: "edit", line: 10, endLine: 20, componentId: "Card" })).toBe(true);
  });
  it("accepts source identities for authored workspace packages", () => {
    expect(isAgentActivity({ requestId: "request", file: "../ui/Card.tsx", operation: "edit" })).toBe(true);
  });
  it("rejects absolute paths, noncanonical traversal, unexpected fields, and invalid ranges", () => {
    for (const file of ["/src/Card.tsx", "src/../Card.tsx", "C:/Card.tsx", "src\\Card.tsx", "src//Card.tsx"]) expect(isAgentActivity({ requestId: "request", file, operation: "read" })).toBe(false);
    for (const fields of [{ line: 0 }, { line: 20, endLine: 10 }, { endLine: 10 }, { status: "completed" }]) expect(isAgentActivity({ requestId: "request", file: "src/Card.tsx", operation: "edit", ...fields })).toBe(false);
  });
});
