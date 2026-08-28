import { describe, expect, it } from "vitest";
import { injectIdentity } from "@nudge-ui/plugin/identity";
import { extractComponentContracts } from "@nudge-ui/plugin/component-contracts";

/**
 * The Next.js host Adapter consumes these build-time Modules through the
 * subpath exports. The smoke assertions pin that the subpaths resolve to the
 * bundler-agnostic functions — not that their transforms are exhaustive
 * (their own unit suites own that).
 */
describe("@nudge-ui/plugin subpath exports", () => {
  it("resolves ./identity to the identity-injection Module", () => {
    expect(typeof injectIdentity).toBe("function");
    const result = injectIdentity(
      "export function Button() { return <button/>; }\n",
      "/project/src/Button.tsx",
      "/project",
    );
    expect(result?.code).toContain("data-cid");
  });

  it("resolves ./component-contracts to the contract-extraction Module", () => {
    const contracts = extractComponentContracts(
      "type P = { size?: 'sm' | 'lg' };\nexport function Button(props: P) { return <button/>; }\n",
      "src/Button.tsx",
    );
    expect(contracts[0]?.name).toBe("Button");
  });
});
