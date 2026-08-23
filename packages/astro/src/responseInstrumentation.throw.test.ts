import { describe, expect, it, vi } from "vitest";

// The catch branch exists so identity extraction can never break a dev page
// load. Driving it requires the identity module to throw for this file only,
// which keeps the main suite's happy-path coverage unpolluted.
vi.mock("./identity.ts", () => ({
  instrumentAstroHtml: () => {
    throw new Error("synthetic identity failure");
  },
}));

const { instrumentAstroResponse } = await import("./responseInstrumentation.ts");

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
    );

    expect(diagnostics).toHaveLength(0);
    expect(result.status).toBe(200);
    expect(result.statusText).toBe("Fine");
    expect(result.headers.get("x-probe")).toBe("kept");
    expect(await result.text()).toBe(source);
  });
});
