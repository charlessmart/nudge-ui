import { describe, expect, it } from "vitest";
import { instrumentAstroHtml } from "./identity.ts";

describe("instrumentAstroHtml", () => {
  it("instruments annotated elements with exact cid and project-relative source", () => {
    const source = `<!doctype html>
<html>
  <head><title>About</title></head>
  <body>
    <header data-astro-source-file="/work/site/src/layouts/Base.astro" data-astro-source-loc="4:2">
      <h1 data-astro-cid-j7pv25f6 data-astro-source-file="/work/site/src/pages/about.astro" data-astro-source-loc="12:9">About</h1>
    </header>
  </body>
</html>`;

    const result = instrumentAstroHtml(source, { projectRoot: "/work/site" });

    expect(result.html).toContain(
      'data-astro-source-loc="4:2" data-cid="astro:Header" data-src="src/layouts/Base.astro:4:2">',
    );
    expect(result.html).toContain(
      'data-astro-source-loc="12:9" data-cid="astro:H1" data-src="src/pages/about.astro:12:9">About</h1>',
    );
    // Astro's scoped-style attribute is forwarded untouched.
    expect(result.html).toContain('<h1 data-astro-cid-j7pv25f6 ');
    expect(result.insertedAttributeCount).toBe(4);
    expect(result.diagnostics).toEqual([]);
  });

  it("keeps relative annotation paths as authored without a project root", () => {
    const source =
      '<!doctype html><body><main data-astro-source-file="src/pages/index.astro" data-astro-source-loc="6:1">Hi</main></body>';

    const result = instrumentAstroHtml(source);

    expect(result.html).toContain(
      '<main data-astro-source-file="src/pages/index.astro" data-astro-source-loc="6:1" data-cid="astro:Main" data-src="src/pages/index.astro:6:1">',
    );
  });

  it("keeps nested elements from different components on their own annotations", () => {
    const source = `<!doctype html>
<body>
  <header data-astro-source-file="src/components/Header.astro" data-astro-source-loc="2:4">
    <nav data-astro-source-file="src/components/Header.astro" data-astro-source-loc="3:6"><a href="/">Home</a></nav>
  </header>
  <footer data-astro-source-file="src/components/Footer.astro" data-astro-source-loc="8:2">&copy;</footer>
</body>`;

    const result = instrumentAstroHtml(source);

    expect(result.html).toContain('data-src="src/components/Header.astro:2:4"');
    expect(result.html).toContain('data-src="src/components/Header.astro:3:6"');
    expect(result.html).toContain('data-src="src/components/Footer.astro:8:2"');
    // The unannotated anchor degrades to a generated label only, while the
    // document stays annotated overall.
    expect(result.html).toContain('<a href="/" data-cid="astro:A">');
    expect(result.diagnostics).toEqual([]);
  });

  it("keeps same-tag elements distinct when compact markup shares a line", () => {
    const source =
      '<!doctype html><body><p data-astro-source-file="src/pages/index.astro" data-astro-source-loc="1:1">A</p><p data-astro-source-file="src/pages/index.astro" data-astro-source-loc="1:34">B</p></body>';

    const result = instrumentAstroHtml(source);

    expect(result.html).toContain(
      '<p data-astro-source-file="src/pages/index.astro" data-astro-source-loc="1:1" data-cid="astro:P" data-src="src/pages/index.astro:1:1">A</p>',
    );
    expect(result.html).toContain(
      '<p data-astro-source-file="src/pages/index.astro" data-astro-source-loc="1:34" data-cid="astro:P" data-src="src/pages/index.astro:1:34">B</p>',
    );
    expect(new Set([...result.html.matchAll(/data-src="([^"]+)"/g)].map((match) => match[1]))).toHaveLength(2);
  });

  it("instruments the astro-island host but not its subtree", () => {
    const source = `<!doctype html>
<body>
  <astro-island uid="Z2x9" component-url="/src/components/Counter.tsx" data-astro-source-file="src/pages/index.astro" data-astro-source-loc="9:1">
    <button data-astro-source-file="src/components/Counter.tsx" data-astro-source-loc="5:3">Count</button>
    <div data-astro-source-file="src/components/Counter.tsx" data-astro-source-loc="6:3"><span>inner</span></div>
  </astro-island>
  <p data-astro-source-file="src/pages/index.astro" data-astro-source-loc="14:1">after</p>
</body>`;

    const result = instrumentAstroHtml(source);

    expect(result.html).toContain(
      'data-cid="astro:Island" data-src="src/pages/index.astro:9:1">',
    );
    expect(result.html).not.toContain("astro:Button");
    expect(result.html).not.toContain("astro:Div");
    expect(result.html).not.toContain("astro:Span");
    expect(result.html).toContain(
      '<button data-astro-source-file="src/components/Counter.tsx" data-astro-source-loc="5:3">Count</button>',
    );
    expect(result.html).toContain(
      '<p data-astro-source-file="src/pages/index.astro" data-astro-source-loc="14:1" data-cid="astro:P" data-src="src/pages/index.astro:14:1">after</p>',
    );
    expect(result.insertedAttributeCount).toBe(4);
  });

  it("skips the Nudge UI mount and its subtree", () => {
    const source = `<!doctype html>
<body>
  <div id="nudge-ui-root" data-astro-source-file="src/pages/index.astro" data-astro-source-loc="2:3">
    <button data-astro-source-file="src/pages/index.astro" data-astro-source-loc="3:5">mount child</button>
  </div>
  <button data-astro-source-file="src/pages/index.astro" data-astro-source-loc="5:3">eligible</button>
</body>`;

    const result = instrumentAstroHtml(source);

    expect(result.html).toContain(
      '<div id="nudge-ui-root" data-astro-source-file="src/pages/index.astro" data-astro-source-loc="2:3">',
    );
    expect(result.html).toContain(
      '<button data-astro-source-file="src/pages/index.astro" data-astro-source-loc="3:5">mount child</button>',
    );
    expect(result.html).not.toContain("<div id=\"nudge-ui-root\" data-cid");
    expect(result.html).toContain(
      'data-astro-source-loc="5:3" data-cid="astro:Button" data-src="src/pages/index.astro:5:3"',
    );
    expect(result.insertedAttributeCount).toBe(2);
  });

  it("skips document structure and non-rendered tags while instrumenting eligible content", () => {
    const source = `<!doctype html>
<html data-astro-source-file="index.astro" data-astro-source-loc="1:1"><head><meta charset="utf-8"></head>
<body data-astro-source-file="index.astro" data-astro-source-loc="2:1">
  <script data-astro-source-file="index.astro" data-astro-source-loc="3:3">let x = "<b>";</script>
  <style>.x { content: "<b>"; }</style>
  <template><button>template</button></template>
  <noscript><button>noscript</button></noscript>
  <section data-astro-source-file="index.astro" data-astro-source-loc="8:1"><button data-astro-source-file="index.astro" data-astro-source-loc="8:11">in</button></section>
</body></html>`;

    const result = instrumentAstroHtml(source);

    expect(result.html).toContain(
      '<section data-astro-source-file="index.astro" data-astro-source-loc="8:1" data-cid="astro:Section" data-src="index.astro:8:1">',
    );
    expect(result.html).toContain(
      'data-astro-source-loc="8:11" data-cid="astro:Button" data-src="index.astro:8:11"',
    );
    for (const untouched of [
      '<html data-astro-source-file="index.astro"',
      '<body data-astro-source-file="index.astro"',
      "<script data-astro-source-file=",
      "</style>",
      "<template>",
      "<noscript>",
    ]) {
      expect(result.html).toContain(untouched);
    }
    expect(result.insertedAttributeCount).toBe(4);
    expect(result.diagnostics).toEqual([]);
  });

  it("preserves author identity attributes independently of Astro's annotations", () => {
    const source = `<!doctype html><body>
<div data-cid="author-cid" data-astro-source-file="src/a.astro" data-astro-source-loc="1:1">cid only</div>
<div data-src="author.html:7:4" data-astro-source-file="src/b.astro" data-astro-source-loc="2:2">src only</div>
<div data-cid="both-cid" data-src="author.html:8:4" data-astro-source-file="src/c.astro" data-astro-source-loc="3:3">both</div>
</body>`;

    const result = instrumentAstroHtml(source);

    expect(result.html).toContain(
      '<div data-cid="author-cid" data-astro-source-file="src/a.astro" data-astro-source-loc="1:1" data-src="src/a.astro:1:1">cid only</div>',
    );
    expect(result.html).toContain(
      '<div data-src="author.html:7:4" data-astro-source-file="src/b.astro" data-astro-source-loc="2:2" data-cid="astro:Div">src only</div>',
    );
    expect(result.html).toContain(
      '<div data-cid="both-cid" data-src="author.html:8:4" data-astro-source-file="src/c.astro" data-astro-source-loc="3:3">both</div>',
    );
    expect(result.insertedAttributeCount).toBe(2);
    expect(result.diagnostics).toEqual([]);
  });

  it("degrades unannotated elements to generated labels with one document-level warning", () => {
    const source =
      '<!doctype html><body><main class="page"><button>Save</button></main></body>';

    const result = instrumentAstroHtml(source);

    expect(result.html).toContain('<main class="page" data-cid="astro:Main">');
    expect(result.html).toContain("<button data-cid=\"astro:Button\">Save</button>");
    expect(result.html).not.toContain("data-src");
    expect(result.insertedAttributeCount).toBe(2);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "astro-source-annotations-absent",
      severity: "warning",
    });
  });

  it("accepts a bare integer location as line-only and warns on unreadable locations", () => {
    const source = `<!doctype html>
<body>
  <hr data-astro-source-file="src/a.astro" data-astro-source-loc="7">
  <br data-astro-source-file="src/b.astro" data-astro-source-loc="12-x">
</body>`;

    const result = instrumentAstroHtml(source);

    expect(result.html).toContain(
      '<hr data-astro-source-file="src/a.astro" data-astro-source-loc="7" data-cid="astro:Hr" data-src="src/a.astro:7">',
    );
    expect(result.html).toContain(
      '<br data-astro-source-file="src/b.astro" data-astro-source-loc="12-x" data-cid="astro:Br">',
    );
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "invalid-source-location",
      severity: "warning",
    });
  });

  it("degrades an empty file annotation to a generated label with a warning", () => {
    const source =
      `<!doctype html><body><h1 data-astro-source-file="" data-astro-source-loc="4:2">Hi</h1></body>`;

    const result = instrumentAstroHtml(source);

    expect(result.html).toContain('<h1 data-astro-source-file="" data-astro-source-loc="4:2" data-cid="astro:H1">');
    expect(result.html).not.toContain('data-src=":');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "invalid-source-location",
      severity: "warning",
    });
  });

  it("leaves fully identified documents byte-identical without spurious warnings", () => {
    const source = `<!doctype html><body>` +
      `<p data-cid="astro:P" data-src="src/a.astro:3:1">One</p>` +
      `<p data-cid="astro:P" data-src="src/b.astro:4:1">Two</p>` +
      `</body>`;
    const result = instrumentAstroHtml(source);

    expect(result.html).toBe(source);
    expect(result.insertedAttributeCount).toBe(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("instruments body-less markup because parse5 synthesizes a body around fragments", () => {
    // Dev-server responses are always complete documents; this pins what a
    // stray fragment does rather than implying passthrough semantics.
    const source = "<div>not a document</div>";
    const result = instrumentAstroHtml(source);

    expect(result.html).toBe('<div data-cid="astro:Div">not a document</div>');
  });

  it("skips SVG and other foreign-namespace subtrees while instrumenting HTML siblings", () => {
    const source = `<!doctype html><body>` +
      `<svg viewBox="0 0 1 1"><circle cx="1" cy="1" r="1"></circle></svg>` +
      `<main data-astro-source-file="src/pages/index.astro" data-astro-source-loc="9:1">Text</main>` +
      `</body>`;
    const result = instrumentAstroHtml(source);

    expect(result.html).toContain('<svg viewBox="0 0 1 1"><circle cx="1" cy="1" r="1"></circle></svg>');
    expect(result.html).toContain(
      '<main data-astro-source-file="src/pages/index.astro" data-astro-source-loc="9:1" data-cid="astro:Main" data-src="src/pages/index.astro:9:1">',
    );
    expect(result.insertedAttributeCount).toBe(2);
  });

  it("skips SVG content inside an island subtree while still instrumenting the island host", () => {
    const source = `<!doctype html><body>` +
      `<astro-island uid="z1"><svg><circle r="1"></circle></svg><button>Load</button></astro-island>` +
      `</body>`;
    const result = instrumentAstroHtml(source);

    expect(result.html).toContain('<astro-island uid="z1" data-cid="astro:Island">');
    expect(result.html).toContain("<circle r=\"1\"></circle>");
    expect(result.html).toContain("<button>Load</button>");
    expect(result.insertedAttributeCount).toBe(1);
  });

  it("inserts attributes correctly when a start tag spans multiple lines", () => {
    const source = `<!doctype html>\n<body>\n  <main\n    class="page"\n    data-astro-source-file="src/pages/index.astro"\n    data-astro-source-loc="6:3">\n  Text\n  </main>\n</body>`;

    const result = instrumentAstroHtml(source);

    expect(result.html).toContain(
      'data-astro-source-loc="6:3" data-cid="astro:Main" data-src="src/pages/index.astro:6:3">',
    );
    expect(result.html.startsWith(`<!doctype html>\n<body>\n  <main\n`)).toBe(true);
    expect(result.insertedAttributeCount).toBe(2);
  });

  it("relativizes absolute annotation paths against the given project root per call", () => {
    const source =
      '<!doctype html><body><main data-astro-source-file="/work/site/src/pages/a.astro" data-astro-source-loc="2:1">Page</main></body>';

    const siteRoot = instrumentAstroHtml(source, { projectRoot: "/work/site" });
    const workRoot = instrumentAstroHtml(source, { projectRoot: "/work" });
    const noRoot = instrumentAstroHtml(source);

    expect(siteRoot.html).toContain('data-src="src/pages/a.astro:2:1"');
    expect(workRoot.html).toContain('data-src="site/src/pages/a.astro:2:1"');
    expect(noRoot.html).toContain('data-src="/work/site/src/pages/a.astro:2:1"');
  });

  it("reports parser diagnostics and preserves source outside insertions for malformed input", () => {
    const source = '<!doctype html>\n<body><div title="unterminated><button>x</button>';
    const result = instrumentAstroHtml(source);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "html-parse-error")).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "astro-source-annotations-absent")).toBe(false);
    expect(result.html).toBe(source);
    expect(result.insertedAttributeCount).toBe(0);
  });

  it("escapes annotation values in inserted attributes without changing authored markup", () => {
    const source =
      '<!doctype html><body><div title="a &quot; > b" data-astro-source-file=\'src/p"a<b.astro\' data-astro-source-loc="4:2">x</div></body>';
    const result = instrumentAstroHtml(source);

    expect(result.html).toContain(
      'data-cid="astro:Div" data-src="src/p&quot;a&lt;b.astro:4:2"',
    );
    expect(
      result.html.replace(
        ' data-cid="astro:Div" data-src="src/p&quot;a&lt;b.astro:4:2"',
        "",
      ),
    ).toBe(source);
  });

  it("keeps CRLF bytes intact outside inserted attributes", () => {
    const source =
      "<!doctype html>\r\n<body>\r\n  <button data-astro-source-file=\"src/a.astro\" data-astro-source-loc=\"3:3\">Save</button>\r\n</body>";
    const result = instrumentAstroHtml(source);

    expect(result.html).toContain(
      'data-cid="astro:Button" data-src="src/a.astro:3:3">Save</button>',
    );
    expect(
      result.html.replace(
        ' data-cid="astro:Button" data-src="src/a.astro:3:3"',
        "",
      ),
    ).toBe(source);
    expect(result.html.includes("\r\n")).toBe(true);
  });
});
