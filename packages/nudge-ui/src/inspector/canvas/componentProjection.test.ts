import { expect, it } from "vitest";
import type { ChangeRecord } from "../changes/types.ts";
import { rewriteSourceSiteSelector, scopeVariantChanges, shareableComponentChanges } from "./componentProjection.ts";

const change = (selector: string, extra: Record<string, unknown> = {}): ChangeRecord => ({
  cid: "Button", file: "src/Button.tsx", line: 3, selector, property: "color", rawValue: "red", oldToken: null, newToken: null,
  source: { file: "src/Button.tsx", line: 3, component: "Button" }, ...extra,
}) as ChangeRecord;

it("matches definition elements as well as forwarded callsite identity", () => {
  expect(rewriteSourceSiteSelector('[data-cid="Button"][data-src="src/Button.tsx:3:5"]'))
    .toBe(':is([data-src="src/Button.tsx:3:5"], [data-nudge-def="src/Button.tsx:3:5"])');
  expect(rewriteSourceSiteSelector('[data-cid="Button"][data-src="src/Button.tsx:3:5"]:hover > span'))
    .toBe(':is([data-src="src/Button.tsx:3:5"], [data-nudge-def="src/Button.tsx:3:5"]):hover > span');
  expect(rewriteSourceSiteSelector('[data-cid="Button"]')).toBe('[data-cid="Button"]');
  expect(rewriteSourceSiteSelector(".plain")).toBe(".plain");
});

it("shares only source-site element styles", () => {
  const shared = shareableComponentChanges([
    change('[data-cid="B"][data-src="a:1:1"]'),
    change('[data-cid="B"][data-src="a:1:1"]', { scope: "rendered-instance" }),
    { kind: "text-content" } as unknown as ChangeRecord,
  ]);
  expect(shared).toHaveLength(1);
  expect(shared[0]).toMatchObject({ selector: ':is([data-src="a:1:1"], [data-nudge-def="a:1:1"])' });
});

it("narrows scoped edits to the variant's marker, for app frames and sheet frames", () => {
  const variantScope = { componentName: "Button", props: { variant: "primary", size: "sm" } };
  const marked = '[data-nudge-ui-variant~="Button.size=sm"][data-nudge-ui-variant~="Button.variant=primary"]';
  const expected = `:is([data-src="a:1:1"], [data-nudge-def="a:1:1"]):is(${marked}, ${marked} *):hover`;
  const [shared] = shareableComponentChanges([change('[data-cid="B"][data-src="a:1:1"]:hover', { variantScope })]);
  expect(shared).toMatchObject({ selector: expected });
  const [sheet] = scopeVariantChanges([change('[data-cid="B"][data-src="a:1:1"]:hover', { variantScope })]);
  expect(sheet).toMatchObject({ selector: expected });
  expect(scopeVariantChanges([change('[data-cid="B"][data-src="a:1:1"]')])[0]).toMatchObject({ selector: '[data-cid="B"][data-src="a:1:1"]' });
});
