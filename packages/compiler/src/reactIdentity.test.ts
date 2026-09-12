import { describe, expect, it } from "vitest";
import { resolveHostComponentPolicy } from "./componentPolicyResolution.ts";
import { defaultReactComponentProtocols } from "./reactComponentProtocols.ts";
import { injectIdentity } from "./reactIdentity.ts";

describe("React identity instrumentation policy", () => {
  it("preserves structural elements while instrumenting route content", async () => {
    const code = `import { Routes as RouteList, Route as Entry } from "react-router-dom";
import { Dashboard } from "./Dashboard";
export const App = () => <RouteList><Entry path="/" element={<Dashboard />} /></RouteList>;`;
    const hostPolicy = await resolveHostComponentPolicy(code, "/project/src/App.tsx", {
      async resolve(specifier) {
        if (specifier === "./Dashboard") return "/project/src/Dashboard.tsx";
        return `/project/node_modules/${specifier}/index.js`;
      },
      async read(id) {
        return id === "/project/src/Dashboard.tsx"
          ? "export function Dashboard() { return <main />; }"
          : null;
      },
      isProjectSource(id) {
        return id.startsWith("/project/src/");
      },
      sourcePath(id) {
        return id.slice("/project/".length);
      },
    }, { moduleProtocols: defaultReactComponentProtocols });
    const result = injectIdentity(code, "/project/src/App.tsx", "/project", {
      instrumentComponents: true,
      hostPolicy,
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

  it("recognizes project-owned factory and tagged-template component definitions", () => {
    const code = `import { lazy } from "react";
import styled from "styled-components";
const Panel = lazy(() => import("./Panel"));
const Button = styled.button\`color: red;\`;
export const App = () => <main><Panel /><Button /></main>;`;
    const result = injectIdentity(code, "/project/src/App.tsx", "/project", {
      instrumentComponents: true,
    });

    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Panel");
    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Button");
  });
});
