import { describe, expect, it, vi } from "vitest";
import {
  instrumentAstroResponse,
  isHtmlContentType,
} from "./responseInstrumentation.ts";

const PROJECT_ROOT = "/work/site";

function annotatedPage(): string {
  return `<!doctype html><html><head><title>About</title></head><body>
    <h1 data-astro-source-file="/work/site/src/pages/about.astro" data-astro-source-loc="12:7">About</h1>
    <p>Body copy</p>
  </body></html>`;
}

describe("isHtmlContentType", () => {
  it("accepts text/html with and without parameters", () => {
    expect(isHtmlContentType("text/html")).toBe(true);
    expect(isHtmlContentType("text/html; charset=utf-8")).toBe(true);
    expect(isHtmlContentType("text/html;charset=UTF-8 ")).toBe(true);
  });

  it("rejects every other media type and absent headers", () => {
    expect(isHtmlContentType("application/json")).toBe(false);
    expect(isHtmlContentType("text/plain")).toBe(false);
    expect(isHtmlContentType("text/event-stream")).toBe(false);
    expect(isHtmlContentType(undefined)).toBe(false);
  });
});

describe("instrumentAstroResponse", () => {
  it("buffers an HTML response into one instrumented body with corrected length", async () => {
    const source = annotatedPage();
    const response = new Response(source, {
      status: 200,
      statusText: "OK",
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    const { response: result } = await instrumentAstroResponse(
      response,
      PROJECT_ROOT,
    );

    const body = await result.text();
    expect(body).toContain('data-cid="astro:H1"');
    expect(body).toContain('data-src="src/pages/about.astro:12:7"');
    expect(body.match(/data-cid="astro:H1"/g)).toHaveLength(1);
    // The authored bytes outside the inserted attributes are preserved, so
    // the body differs from the source only by identity insertions.
    expect(result.headers.get("content-length")).toBe(
      String(Buffer.byteLength(body, "utf8")),
    );
    expect(result.status).toBe(200);
    expect(result.statusText).toBe("OK");
  });

  it("reports identity diagnostics alongside the instrumented response", async () => {
    const source = `<!doctype html><body><button>Save</button></body>`;
    const response = new Response(source, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    const { response: result, diagnostics } = await instrumentAstroResponse(
      response,
      PROJECT_ROOT,
    );

    const body = await result.text();
    expect(body).toContain('data-cid="astro:Button"');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("astro-source-annotations-absent");
  });

  it("returns non-HTML responses untouched", async () => {
    const payload = JSON.stringify({ ok: true });
    const response = new Response(payload, {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });

    const { response: result, diagnostics } = await instrumentAstroResponse(
      response,
      PROJECT_ROOT,
    );

    expect(result).toBe(response);
    expect(await result.text()).toBe(payload);
    expect(diagnostics).toHaveLength(0);
  });

  it("returns responses without a content type untouched", async () => {
    const response = new Response("<h1>mystery</h1>");

    const { response: result } = await instrumentAstroResponse(response, PROJECT_ROOT);

    expect(result).toBe(response);
  });

  it("passes empty-body HTML responses through unchanged", async () => {
    const response = new Response(null, {
      status: 204,
      headers: { "content-type": "text/html" },
    });

    const { response: result, diagnostics } = await instrumentAstroResponse(
      response,
      PROJECT_ROOT,
    );

    expect(result).toBe(response);
    expect(diagnostics).toHaveLength(0);
  });
});
