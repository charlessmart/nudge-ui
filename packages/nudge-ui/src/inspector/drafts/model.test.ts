// @vitest-environment jsdom
import { expect, it } from "vitest";
import { componentsTarget, documentTarget, isDraftTarget, targetFromKey, targetKey } from "./model.ts";

it("keys the shared components draft and recognizes sheet documents", () => {
  expect(targetKey(componentsTarget())).toBe("components");
  expect(targetFromKey("components")).toEqual({ kind: "components" });
  expect(isDraftTarget({ kind: "components" })).toBe(true);
  expect(documentTarget(`${window.location.origin}/__nudge_ui__/components?component=a%3AB`)).toEqual({ kind: "components" });
  expect(documentTarget(`${window.location.origin}/about`).kind).toBe("application");
});
