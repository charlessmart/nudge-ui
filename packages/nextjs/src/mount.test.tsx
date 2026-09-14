import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NudgeUiMount } from "./mount.tsx";

describe("NudgeUiMount", () => {
  it("installs a load-failure diagnostic before requesting the inspector client", () => {
    const markup = renderToStaticMarkup(<NudgeUiMount />);
    const diagnosticIndex = markup.indexOf("[nudge-ui] inspector bootstrap failed to load.");
    const clientIndex = markup.indexOf('data-nudge-ui-client=""');

    expect(diagnosticIndex).toBeGreaterThan(-1);
    expect(diagnosticIndex).toBeLessThan(clientIndex);
    expect(markup).toContain('src="/__nudge_ui__/client.mjs"');
  });
});
