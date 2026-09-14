import { describe, expect, it } from "vitest";
import { instrumentSourceHtml } from "./identity.ts";

describe("instrumentSourceHtml", () => {
  it("instruments eligible elements under body with source identity", () => {
    const source = `<!doctype html>
<html>
  <head><title>Prototype</title></head>
  <body>
    <main class="page"><button>Save</button></main>
  </body>
</html>`;

    const result = instrumentSourceHtml(source, "index.html");

    expect(result.html).toContain(
      '<main class="page" data-cid="html:main" data-src="index.html:5:5">',
    );
    expect(result.html).toContain(
      '<button data-cid="html:button" data-src="index.html:5:24">Save</button>',
    );
    expect(result.insertedAttributeCount).toBe(4);
    expect(result.diagnostics).toEqual([]);
  });

  it("keeps same-tag elements distinct when compact markup shares a line", () => {
    const source = "<!doctype html><body><button>A</button><button>B</button></body>";
    const result = instrumentSourceHtml(source, "pages/home.html");

    expect(result.html).toContain(
      '<button data-cid="html:button" data-src="pages/home.html:1:22">A</button>',
    );
    expect(result.html).toContain(
      '<button data-cid="html:button" data-src="pages/home.html:1:40">B</button>',
    );
    expect(result.html.match(/data-src="pages\/home\.html:1:\d+"/g)).toHaveLength(2);
    expect(new Set([...result.html.matchAll(/data-src="([^"]+)"/g)].map((match) => match[1]))).toHaveLength(2);
  });

  it("preserves author identity attributes independently", () => {
    const source = `<!doctype html><body>
<div data-cid="author-cid">cid only</div>
<div data-src="author.html:7:4">src only</div>
<div data-cid="both-cid" data-src="author.html:8:4">both</div>
</body>`;

    const result = instrumentSourceHtml(source, "index.html");

    expect(result.html).toContain(
      '<div data-cid="author-cid" data-src="index.html:2:1">cid only</div>',
    );
    expect(result.html).toContain(
      '<div data-src="author.html:7:4" data-cid="html:div">src only</div>',
    );
    expect(result.html).toContain(
      '<div data-cid="both-cid" data-src="author.html:8:4">both</div>',
    );
    expect(result.insertedAttributeCount).toBe(2);
  });

  it("skips document structure, non-rendered tags, and the Nudge UI mount", () => {
    const source = `<!doctype html>
<html data-cid="do-not-touch"><head><meta data-cid="head"></head>
<body data-cid="body">
  <script><button>script</button></script>
  <style>.x { content: "<button>style</button>"; }</style>
  <template><button>template</button></template>
  <noscript><button>noscript</button></noscript>
  <div id="nudge-ui-root"><button>mount child</button></div>
  <button>eligible</button>
</body></html>`;

    const result = instrumentSourceHtml(source, "index.html");

    expect(result.html).not.toContain('data-cid="html:button" data-src="index.html:4:');
    expect(result.html).not.toContain('data-cid="html:button" data-src="index.html:5:');
    expect(result.html).not.toContain('data-cid="html:button" data-src="index.html:6:');
    expect(result.html).not.toContain('data-cid="html:button" data-src="index.html:7:');
    expect(result.html).not.toContain('data-cid="html:button" data-src="index.html:8:');
    expect(result.html).toContain('<button data-cid="html:button" data-src="index.html:9:3">eligible</button>');
  });

  it("skips SVG nodes and their descendants while instrumenting following HTML", () => {
    const source = "<!doctype html><body><svg><circle></circle><foreignObject><div>svg child</div></foreignObject></svg><div>html</div></body>";
    const result = instrumentSourceHtml(source, "index.html");

    expect(result.html).not.toContain("html:svg");
    expect(result.html).not.toContain("html:circle");
    expect(result.html).toContain(
      "<svg><circle></circle><foreignObject><div>svg child</div></foreignObject></svg>",
    );
    expect(result.html).toContain('data-cid="html:div" data-src="index.html:1:101"');
  });

  it("uses original locations for multiline and same-line insertions", () => {
    const source = `<!doctype html>
<body>
  <section
    aria-label="A > B"
  ><button>One</button><button>Two</button></section>
</body>`;

    const result = instrumentSourceHtml(source, "nested/page.html");

    expect(result.html).toContain('data-src="nested/page.html:3:3"');
    expect(result.html).toContain('data-src="nested/page.html:5:4"');
    expect(result.html).toContain('data-src="nested/page.html:5:24"');
  });

  it("keeps source identity scoped to each HTML file", () => {
    const source = "<!doctype html><body><main>Page</main></body>";

    const first = instrumentSourceHtml(source, "index.html");
    const second = instrumentSourceHtml(source, "pages/about.html");

    expect(first.html).toContain('data-src="index.html:1:22"');
    expect(second.html).toContain('data-src="pages/about.html:1:22"');
  });

  it("escapes file identity values without changing authored markup", () => {
    const source = '<!doctype html><body><div title="a &quot; > b">x</div></body>';
    const result = instrumentSourceHtml(source, 'pages/a"&<b.html');

    expect(result.html).toContain(
      'data-src="pages/a&quot;&amp;&lt;b.html:1:22"',
    );
    expect(result.html).toContain('title="a &quot; > b"');
    expect(
      result.html.replace(
        ' data-cid="html:div" data-src="pages/a&quot;&amp;&lt;b.html:1:22"',
        "",
      ),
    ).toBe(source);
  });

  it("reports parser diagnostics and preserves source outside insertions for malformed input", () => {
    const source = '<!doctype html>\n<body><div title="unterminated><button>x</button>';
    const result = instrumentSourceHtml(source, "broken.html");

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "html-parse-error")).toBe(true);
    expect(result.html).toBe(source);
    expect(result.insertedAttributeCount).toBe(0);
  });

  it("returns the exact original string when no eligible element needs identity", () => {
    const source = '<!doctype html><html><head><title>Only head</title></head><body><div data-cid="x" data-src="x.html:1:1">done</div></body></html>';
    const result = instrumentSourceHtml(source, "index.html");

    expect(result.html).toBe(source);
    expect(result.insertedAttributeCount).toBe(0);
  });

  it("computes identity from original offsets in CRLF sources without changing bytes", () => {
    const source = "<!doctype html>\r\n<body>\r\n  <button>Save</button>\r\n</body>";
    const result = instrumentSourceHtml(source, "index.html");

    expect(result.html).toContain('data-src="index.html:3:3"');
    expect(
      result.html.replace(' data-cid="html:button" data-src="index.html:3:3"', ""),
    ).toBe(source);
    expect(result.html.includes("\r\n")).toBe(true);
  });

  it("treats a lone carriage return as a line break like the HTML spec", () => {
    const source = "<!doctype html><body>\r<button>Save</button>";
    const result = instrumentSourceHtml(source, "index.html");

    expect(result.html).toContain('data-src="index.html:2:1"');
  });

  it("counts a tab as one column so offsets stay grep-comparable", () => {
    const source = "<!doctype html>\n<body>\n\t<button>Save</button>\n</body>";
    const result = instrumentSourceHtml(source, "index.html");

    expect(result.html).toContain('data-src="index.html:3:2"');
  });

  it("reserves only the fixed Nudge UI mount ID", () => {
    const source = '<!doctype html><body><div id="prototype-mount"><button>instrument</button></div><button>keep</button></body>';
    const result = instrumentSourceHtml(source, "index.html");

    expect(result.html).toContain(
      '<div id="prototype-mount" data-cid="html:div" data-src="index.html:1:22"><button data-cid="html:button" data-src="index.html:1:48">instrument</button></div>',
    );
    expect(result.html).toContain('data-src="index.html:1:81"');
  });
});
