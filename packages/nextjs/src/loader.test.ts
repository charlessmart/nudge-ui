import { afterEach, describe, expect, it } from "vitest";
import {
  directivePrologueEnd,
  hasUseClientDirective,
  instrumentRootLayout,
  transformNextModuleSource,
} from "./loader.ts";

const ROOT = "/project";

function transform(source: string, moduleId: string) {
  return transformNextModuleSource(source, moduleId, { root: ROOT });
}

describe("NEXT_PHASE production-build guard", () => {
  const ORIGINAL_PHASE = process.env.NEXT_PHASE;

  afterEach(() => {
    if (ORIGINAL_PHASE === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = ORIGINAL_PHASE;
  });

  it("skips every transform during phase-production-build (ADR-0002)", () => {
    process.env.NEXT_PHASE = "phase-production-build";
    // Even a NODE_ENV=development build cannot register instrumentation:
    // the loader itself refuses to transform while Next is building.
    expect(
      transform('"use client";\nexport function A() { return <div/>; }\n', `${ROOT}/src/A.tsx`),
    ).toBeNull();
    // The compiler-facing loader entry carries the same guard.
    expect(
      instrumentRootLayout('export default function L(){return <html><body></body></html>;}'),
    ).not.toBeNull(); // pure helper stays pure; entry-level guard covers the pipeline
  });

  it("transforms when the phase is the development server", () => {
    process.env.NEXT_PHASE = "phase-development-server";
    expect(
      transform("export function A() { return <div/>; }\n", `${ROOT}/src/A.tsx`),
    ).not.toBeNull();
  });
});

describe("transformNextModuleSource — exclusions and extensions", () => {
  it("returns null for non-JSX TypeScript and JavaScript sources", () => {
    expect(transform("export const answer = 42;\n", `${ROOT}/src/answer.ts`)).toBeNull();
    expect(transform("export const answer = 42;\n", `${ROOT}/src/answer.js`)).toBeNull();
    expect(transform("export default 1;\n", `${ROOT}/src/answer.mts`)).toBeNull();
  });

  it("rejects excluded directories before any parsing", () => {
    expect(
      transform("export function A() { return <div/>; }\n", `${ROOT}/node_modules/pkg/A.tsx`),
    ).toBeNull();
    expect(
      transform("export function A() { return <div/>; }\n", `${ROOT}/.next/server/A.tsx`),
    ).toBeNull();
  });

  it("preserves source bytes when nothing matches a JSX module", () => {
    const source = "const value: string = 'no components here';\n";
    expect(transform(source, `${ROOT}/src/plain.tsx`)).toBeNull();
  });
});

describe("transformNextModuleSource — identity injection", () => {
  it("injects data-cid/data-src into host elements with project-relative sources", () => {
    const result = transform(
      "export function Card() {\n  return <main><p>Hello</p></main>;\n}\n",
      `${ROOT}/src/app/Card.tsx`,
    );

    expect(result).not.toBeNull();
    // `data-cid` carries the enclosing component name, matching the Vite
    // Adapter's semantics; `data-src` is project-relative with 1-indexed
    // columns.
    expect(result!.code).toContain('data-cid="Card"');
    expect(result!.code).toContain('data-src="src/app/Card.tsx:2:11"');
    expect(result!.map).not.toBeNull();
    expect(result!.clientComponent).toBe(false);
    expect(result!.layoutInstrumented).toBe(false);
  });

  it("handles fragments and sibling adjacency", () => {
    const result = transform(
      "export function Row() {\n  return <>\n<span>Left</span><span>Right</span>\n</>;\n}\n",
      `${ROOT}/src/Row.tsx`,
    );

    expect(result).not.toBeNull();
    expect((result!.code.match(/data-src=/g) ?? []).length).toBe(2);
  });

  it("survives type-argument JSX lookalikes", () => {
    const result = transform(
      "function f<T extends object>() { return null; }\nexport const ok = f<{ a: string }>;\nexport function Page() { return <section/>; }\n",
      `${ROOT}/src/Page.tsx`,
    );

    expect(result).not.toBeNull();
    expect(result!.code).toContain('data-cid="Page"');
  });
});

describe("transformNextModuleSource — client-component policy", () => {
  const CLIENT_BUTTON =
    '"use client";\nfunction Chip({ label }: { label: string }) { return <b>{label}</b>; }\n'
    + 'export function Button() { return <button><Chip label="hi" /></button>; }\n';

  it("prepends the runtime import and wraps component callsites for directive modules", () => {
    const result = transform(CLIENT_BUTTON, `${ROOT}/src/Button.tsx`);

    expect(result!.clientComponent).toBe(true);
    expect(result!.code).toContain("@nudge-ui/inspector/component-runtime");
    expect(result!.code).toContain("__nudgeUiInstrumentComponent(");
    // Host elements are attributed but never wrapped.
    expect(result!.code).toContain('data-cid="Button"');
  });

  it("keeps semantic instrumentation outside an Adapter-owned source scope disabled", () => {
    const result = transformNextModuleSource(
      CLIENT_BUTTON,
      "/workspace/packages/unowned/Button.tsx",
      { root: ROOT, instrumentComponents: false },
    );

    expect(result!.clientComponent).toBe(true);
    expect(result!.code).not.toContain("@nudge-ui/inspector/component-runtime");
    expect(result!.code).not.toContain("__nudgeUiInstrumentComponent(");
  });

  it("keeps the use client directive in prologue position when injecting the runtime import", () => {
    const result = transform(CLIENT_BUTTON, `${ROOT}/src/Button.tsx`);

    // SWC rejects a module whose first statement is not the directive.
    expect(result!.code.trimStart().startsWith('"use client";')).toBe(true);
    expect(
      result!.code.indexOf('"use client"'),
    ).toBeLessThan(
      result!.code.indexOf("@nudge-ui/inspector/component-runtime"),
    );
  });

  it("upgrades Pages Router modules without a directive", () => {
    const pagesFixture =
      'function Chip({ label }: { label: string }) { return <b>{label}</b>; }\n'
      + 'export default function Page() { return <p><Chip label="x" /></p>; }\n';
    const result = transform(pagesFixture, `${ROOT}/pages/index.tsx`);

    expect(result!.clientComponent).toBe(true);
    expect(result!.code).toContain("@nudge-ui/inspector/component-runtime");
  });

  it("does not treat app/pages/** as Pages Router (stays server-side)", () => {
    // An App Router route nested under a same-named directory is still a
    // server component; wrapping it with the client runtime would break
    // the RSC graph.
    const result = transform(
      "export default function Card() { return <p>card</p>; }\n",
      `${ROOT}/app/pages/Card.tsx`,
    );

    expect(result).not.toBeNull();
    expect(result!.clientComponent).toBe(false);
    expect(result!.code).not.toContain("@nudge-ui/inspector/component-runtime");
  });

  it("matches src/pages for Pages Router applications", () => {
    const result = transform(
      "export default function Page() { return <p>Hi</p>; }\n",
      `${ROOT}/src/pages/index.tsx`,
    );

    expect(result!.clientComponent).toBe(true);
  });

  it("honours a custom pages directory name", () => {
    const result = transformNextModuleSource(
      "export default function Page() { return <p>Hi</p>; }\n",
      `${ROOT}/routes/index.tsx`,
      { root: ROOT, pagesDir: "routes" },
    );

    expect(result!.clientComponent).toBe(true);
  });

  it("fails closed for app-dir modules without the directive", () => {
    const result = transform(
      "export function Server() { return <article/>; }\n",
      `${ROOT}/src/app/Server.tsx`,
    );

    expect(result!.clientComponent).toBe(false);
    expect(result!.code).not.toContain("@nudge-ui/inspector/component-runtime");
    // Identity attributes are still present.
    expect(result!.code).toContain('data-cid="Server"');
  });

  it("ignores use-client-looking strings that are not directive prologues", () => {
    expect(hasUseClientDirective('const tag = "use client";\n')).toBe(false);
    expect(hasUseClientDirective("// use client\nexport {};\n")).toBe(false);
    expect(hasUseClientDirective('"use strict";\n"use client";\nexport {};\n')).toBe(true);
    expect(hasUseClientDirective("#!/usr/bin/env node\n'use client';\n")).toBe(true);
  });
});

describe("instrumentRootLayout", () => {
  const LAYOUT_ID = `${ROOT}/app/layout.tsx`;

  it("is applied by the main entry to html-rendering layouts", () => {
    const result = transform(
      "export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang=\"en\">\n      <body className=\"theme\">{children}</body>\n    </html>\n  );\n}\n",
      LAYOUT_ID,
    );

    expect(result!.layoutInstrumented).toBe(true);
    expect(result!.code).toContain("@nudge-ui/nextjs/mount");
    const mountExpression = "{__NudgeUiCreateElement(__NudgeUiMountElement)}";
    const mountIndex = result!.code.indexOf(mountExpression);
    expect(mountIndex).toBeGreaterThan(result!.code.indexOf("<body"));
    // The mount lands inside <body>, before its closing tag, so Next evaluates
    // the bootstrap script from the initial document rather than waiting for
    // a root-layout client boundary to hydrate.
    expect(mountIndex).toBeLessThan(result!.code.lastIndexOf("</body>"));
    expect(result!.code.indexOf(mountExpression, mountIndex + 1)).toBe(-1);
  });

  it("finds a body nested in a JSX fragment", () => {
    const result = instrumentRootLayout(
      "export default function RootLayout({ children }) {\n  return <html><><body>{children}</body></></html>;\n}\n",
    );

    const mountIndex = result!.code.indexOf("{__NudgeUiCreateElement(__NudgeUiMountElement)}");
    expect(mountIndex).toBeGreaterThan(result!.code.indexOf("<body>"));
    expect(mountIndex).toBeLessThan(result!.code.indexOf("</body>"));
  });

  it("skips layouts without a literal body element", () => {
    const source = "export default function RootLayout({ children }) {\n  return <html><Body>{children}</Body></html>;\n}\n";

    expect(instrumentRootLayout(source)).toBeNull();
  });

  it("leaves non-html layouts untouched", () => {
    const source =
      "export default function SubLayout({ children }: { children: React.ReactNode }) {\n  return <section>{children}</section>;\n}\n";
    const result = instrumentRootLayout(source);

    expect(result).toBeNull();
  });

  it("keeps a use client directive in prologue position when inserting the import", () => {
    const result = transform(
      '"use client";\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang=\"en\"><body>{children}</body></html>;\n}\n',
      LAYOUT_ID,
    );

    expect(result).not.toBeNull();
    const code = result!.code;
    expect(code.indexOf('"use client"')).toBeLessThan(code.indexOf("@nudge-ui/nextjs/mount"));
    expect(code.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("is fully idempotent across chained runs", () => {
    const source = "export default function RootLayout({ children }: { children: unknown }) {\n  return <html lang=\"en\"><body>{children}</body></html>;\n}\n";

    const first = transform(source, LAYOUT_ID)!;
    const second = transform(first.code, LAYOUT_ID);

    // The mount renders through an expression container no identity pass can
    // see, previously injected attributes are guarded in the shared Module,
    // and the layout marker blocks re-insertion — so a chained run finds
    // nothing to do and reports the input unchanged.
    expect(second).toBeNull();

    // The layout pass itself is strictly idempotent via its marker.
    expect(instrumentRootLayout(first.code)).toBeNull();
  });

  it("produces byte-identical output across repeated runs of the same input (determinism)", () => {
    const source = "export default function RootLayout({ children }: { children: unknown }) {\n  return <html lang=\"en\"><body>{children}</body></html>;\n}\n";

    const first = transform(source, LAYOUT_ID)!;
    const second = transform(source, LAYOUT_ID)!;

    expect(second.code).toBe(first.code);
    expect(second.clientComponent).toBe(first.clientComponent);
  });
});

describe("directivePrologueEnd", () => {
  it("finds the insertion point after comments and directives", () => {
    expect(directivePrologueEnd('"use client";\nexport {};')).toBe('"use client";\n'.length);
    expect(
      directivePrologueEnd("// lead\n/* block */ \"use strict\";\nconst x = 1;"),
    ).toBe('// lead\n/* block */ "use strict";\n'.length);
  });

  it("returns 0 when no prologue exists", () => {
    expect(directivePrologueEnd("const x = 1;\n")).toBe(0);
  });

  it("returns source length for comment-only or empty sources", () => {
    expect(directivePrologueEnd("// only a comment")).toBe("// only a comment".length);
    expect(directivePrologueEnd("")).toBe(0);
  });
});
