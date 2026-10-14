import { instrumentRenderedHtml, type HtmlIdentityDiagnostic } from "../../html/identity.ts";

const HTML_MEDIA_TYPE_PATTERN = /^text\/html$/i;

// Measures Content-Length in bytes without assuming a Node global; the middleware may run on any runtime.
const HTML_BYTE_LENGTH_ENCODER = new TextEncoder();

/** Only `text/html` (with optional parameters such as charset) is eligible; everything else passes through untouched. */
export function isHtmlContentType(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim() ?? "";
  return HTML_MEDIA_TYPE_PATTERN.test(mediaType);
}

export interface InstrumentedAstroResponse {
  readonly response: Response;
  /** Empty for untouched responses. */
  readonly diagnostics: readonly HtmlIdentityDiagnostic[];
}

/** Injectable so failure handling can be driven through a real seam rather than by replacing the identity module. */
export type AstroHtmlInstrumenter = typeof instrumentRenderedHtml;

/** HTML bodies are materialized once to re-emit with a corrected Content-Length; every other response is returned by reference, stream untouched. */
export async function instrumentAstroResponse(
  response: Response,
  projectRoot: string | undefined,
  instrument: AstroHtmlInstrumenter = instrumentRenderedHtml,
): Promise<InstrumentedAstroResponse> {
  const contentType = response.headers.get("content-type") ?? undefined;
  if (!isHtmlContentType(contentType)) return { response, diagnostics: [] };
  if (response.body === null) return { response, diagnostics: [] };

  let source: string;
  try {
    source = await response.text();
  } catch {
    // Forward the original response by reference: its stream is the only remaining body.
    return { response, diagnostics: [] };
  }
  try {
    const result = instrument(source, { projectRoot });
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
    // Identity extraction must never break a dev page load; forward the untouched body.
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
