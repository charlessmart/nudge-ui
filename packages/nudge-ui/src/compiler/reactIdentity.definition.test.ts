import { describe, expect, it } from "vitest";
import { injectIdentity } from "./reactIdentity.ts";

describe("definition-site identity", () => {
  it("appends data-nudge-def after all attributes of a host element with a spread", () => {
    const code = `export function Button(props) {
  return <button className="a" {...props} type="button">x</button>;
}`;
    const out = injectIdentity(code, "/project/src/Button.tsx", "/project")?.code ?? "";
    const match = /<button[^>]*>/.exec(out)?.[0] ?? "";
    expect(match).toContain('data-src="src/Button.tsx:2:11"');
    expect(match).toMatch(/type="button" data-nudge-def="src\/Button\.tsx:2:11">$/);
  });

  it("places it after a trailing spread", () => {
    const code = `export const A = (p) => <div {...p} />;`;
    const out = injectIdentity(code, "/project/src/A.tsx", "/project")?.code ?? "";
    expect(out).toMatch(/\{\.\.\.p\} data-nudge-def="src\/A\.tsx:1:26" \/>/);
  });

  it("skips elements without spreads", () => {
    const code = `export const A = (p) => <section><Foo id="y" /><span id="x" /></section>;`;
    const out = injectIdentity(code, "/project/src/A.tsx", "/project")?.code ?? "";
    expect(out).not.toContain("data-nudge-def");
  });

  it("records the definition after spreads on component tags that render the root, like shadcn's Comp", () => {
    const code = `export function Button(props) { const Comp = "button"; return <Comp className="b" {...props} />; }`;
    const out = injectIdentity(code, "/project/src/Button.tsx", "/project")?.code ?? "";
    expect(out).toMatch(/\{\.\.\.props\} data-nudge-def="src\/Button\.tsx:1:\d+"/);
  });
});
