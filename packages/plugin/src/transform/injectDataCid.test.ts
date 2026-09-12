import { describe, expect, it } from "vitest";
import * as compiler from "@nudge-ui/compiler";
import { injectDataCid, injectIdentity } from "./injectDataCid.ts";

/**
 * This module is a compatibility re-export for the documented
 * `@nudge-ui/vite-react/identity` subpath. The assertions live here so the shim
 * cannot drift from the compiler it re-exports; the transform's own behaviour
 * suite lives in `packages/compiler`.
 */
describe("legacy identity subpath", () => {
  it("re-exports the compiler's identity functions", () => {
    expect(injectIdentity).toBe(compiler.injectIdentity);
    expect(injectDataCid).toBe(compiler.injectDataCid);
  });

  it("still injects identity attributes for a direct caller", () => {
    const result = injectIdentity(
      "export function Button() { return <button/>; }\n",
      "/project/src/Button.tsx",
      "/project",
    );

    expect(result?.code).toContain('data-cid="Button"');
  });
});
