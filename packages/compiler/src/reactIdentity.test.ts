import { describe, expect, it } from "vitest";
import { injectIdentity } from "./reactIdentity.ts";

describe("React identity instrumentation policy", () => {
  it("preserves React Router structural elements while instrumenting route content", () => {
    const code = `import { Routes as RouteList, Route as Entry } from "react-router-dom";
import { Dashboard } from "./Dashboard";
export const App = () => <RouteList><Entry path="/" element={<Dashboard />} /></RouteList>;`;
    const result = injectIdentity(code, "/project/src/App.tsx", "/project", {
      instrumentComponents: true,
    });

    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<RouteList");
    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<Entry");
    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Dashboard");
  });

  it("requires explicit compatibility metadata for package component exports", () => {
    const code = `import { Button, Menu } from "@ui/components";
export const App = () => <main><Button /><Menu /></main>;`;
    const result = injectIdentity(code, "/project/src/App.tsx", "/project", {
      instrumentComponents: true,
      compatibleComponentImports: { "@ui/components": ["Button"] },
    });

    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Button");
    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<Menu");
  });
});
