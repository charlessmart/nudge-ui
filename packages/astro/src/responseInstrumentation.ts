import { instrumentAstroHtml, type AstroIdentityDiagnostic } from "./identity.ts";

const HTML_MEDIA_TYPE_PATTERN = /^text\/html$/i;

/**
 * Measures `Content-Length` in bytes without assuming a Node global; the
 * middleware itself may run on any runtime that serves Astro's dev server.
 */
const HTML_BYTE_LENGTH_ENCODER = new TextEncoder();

/**
 * Classifies a response Content-Type header. Only `text/html` responses
 * (with optional parameters such as charset) are eligible for identity
 * instrumentation; everything else must pass through untouched.
 */
export function isHtmlContentType(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim() ?? "";
  return HTML_MEDIA_TYPE_PATTERN.test(mediaType);
}

/** The instrumented response plus the identity diagnostics it produced. */
export interface InstrumentedAstroResponse {
  /** A response safe to hand back to Astro. */
  readonly response: Response;
  /** Identity diagnostics in source order; empty for untouched responses. */
  readonly diagnostics: readonly AstroIdentityDiagnostic[];
}

/**
 * Instruments one rendered dev response at the Astro middleware seam
 * (ADR-0011).
 *
 * HTML bodies are materialized once, transformed through the identity Module,
 * and re-emitted as a new `Response` whose headers carry a corrected
 * `Content-Length`; every other response is returned by reference with its
 * stream untouched. If the body read or instrumentation throws, the original
 * response forwards so identity extraction can never break a dev page load —
 * a failed read returns the original response by reference (its stream is the
 * only remaining representation), while a failed transform returns a fresh
 * `Response` over the already-materialized body. Diagnostics always
 * accompany the result so callers can surface degraded identity.
 *
 * @param response The response produced downstream (the rendered page).
 * @param projectRoot Project root used to relativize annotation paths.
 */
export async function instrumentAstroResponse(
  response: Response,
  projectRoot: string | undefined,
): Promise<InstrumentedAstroResponse> {
  const contentType = response.headers.get("content-type") ?? undefined;
  if (!isHtmlContentType(contentType)) return { response, diagnostics: [] };
  if (response.body === null) return { response, diagnostics: [] };

  let source: string;
  try {
    source = await response.text();
  } catch {
    // The body read itself failed; the original response is the only
    // remaining representation of the body, so forward it by reference
    // instead of rejecting into the middleware chain.
    return { response, diagnostics: [] };
  }
  try {
    const result = instrumentAstroHtml(source, { projectRoot });
    const headers = new Headers(response.headers);
    headers.set(
      "content-length",
      String(HTML_BYTE_LENGTH_ENCODER.encode(result.html).length),
    );
    return {
      response: new Response(result.html, {
        status: response.status,
        statusText: response.statusText,
        headers,
      }),
      diagnostics: result.diagnostics,
    };
  } catch {
    // Identity extraction must never break a dev page load; forward the
    // untouched body instead.
    return {
      response: new Response(source, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
      diagnostics: [],
    };
  }
}
