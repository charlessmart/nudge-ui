import { describe, expect, it } from "vitest";

import { instrumentAstroResponse } from "./responseInstrumentation.ts";

// The catch branch exists so identity extraction can never break a dev page
// load. Driving it injects a failing identity transform for this file only,
// which keeps the main suite's happy-path coverage unpolluted.
function throwingInstrumenter(): never {
  throw new Error("synthetic identity failure");
}

describe("instrumentAstroResponse failure tolerance", () => {
  it("forwards the untouched body when instrumentation throws", async () => {
    const source = "<!doctype html><body><h1>Page</h1></body>";
    const response = new Response(source, {
      status: 200,
      statusText: "Fine",
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-probe": "kept",
      },
    });

    const { response: result, diagnostics } = await instrumentAstroResponse(
      response,
      "/work/site",
      throwingInstrumenter,
    );

    expect(diagnostics).toHaveLength(0);
    expect(result.status).toBe(200);
    expect(result.statusText).toBe("Fine");
    expect(result.headers.get("x-probe")).toBe("kept");
    expect(await result.text()).toBe(source);
  });
});
