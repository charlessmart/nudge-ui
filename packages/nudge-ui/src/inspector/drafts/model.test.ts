// @vitest-environment jsdom
import { expect, it } from "vitest";
import { artifactIdFromUrl, componentsTarget, documentTarget, htmlTarget, isDraftTarget, targetFromKey, targetKey } from "./model.ts";

it("keys the shared components draft and recognizes sheet documents", () => {
  expect(targetKey(componentsTarget())).toBe("components");
  expect(targetFromKey("components")).toEqual({ kind: "components" });
  expect(isDraftTarget({ kind: "components" })).toBe(true);
  expect(documentTarget(`${window.location.origin}/__nudge_ui__/components?component=a%3AB`)).toEqual({ kind: "components" });
  expect(documentTarget(`${window.location.origin}/about`).kind).toBe("application");
});

it("recognizes legacy and readable artifact URLs", () => {
  const legacy = "550e8400-e29b-41d4-a716-446655440000";
  const slugged = "landing-page-one-4f3c2a1e";

  expect(artifactIdFromUrl(`${window.location.origin}/__nudge_ui__/artifacts/${legacy}/preview`)).toBe(legacy);
  expect(artifactIdFromUrl(`${window.location.origin}/__nudge_ui__/artifacts/${slugged}/preview`)).toBe(slugged);
  expect(documentTarget(`${window.location.origin}/__nudge_ui__/artifacts/${slugged}/preview`)).toEqual(htmlTarget(slugged));
  expect(artifactIdFromUrl(`${window.location.origin}/__nudge_ui__/artifacts/not%2Fsafe/preview`)).toBeNull();
});
