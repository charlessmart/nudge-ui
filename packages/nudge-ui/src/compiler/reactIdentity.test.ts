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

  it("registers callsites it cannot wrap so the runtime can still name them", () => {
    const code = `import { Box } from "@ui/components";
import { Card } from "./Card";
export const App = () => <Box><Card /></Box>;`;
    const result = injectIdentity(code, "/project/src/App.tsx", "/project", {
      instrumentComponents: true,
      hostPolicy: {
        components: { Card: { componentId: "src/Card#Card", wrap: true, slots: { children: "rendered" } } },
        diagnostics: [],
      },
    });

    // Card sits inside a package component with unknown slots, so it stays unwrapped too.
    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(");
    const prelude = result?.prelude ?? "";
    expect(result?.code.startsWith(prelude)).toBe(true);
    expect(prelude.trimEnd().split("\n")).toHaveLength(1);
    expect(prelude).toContain('import { registerReactCallsites as __nudgeUiRegisterCallsites } from "nudge-ui/internal/component-runtime";');
    const registered = JSON.parse(/__nudgeUiRegisterCallsites\((.*)\);$/.exec(prelude.trimEnd())![1]!) as unknown[];
    expect(registered).toEqual([
      expect.objectContaining({ callsiteId: "src/App.tsx:3:27", componentId: "@ui/components#Box", componentName: "Box" }),
      expect.objectContaining({ callsiteId: "src/App.tsx:3:32", componentId: "src/Card#Card", componentName: "Card" }),
    ]);
    expect(result?.code).toContain('<Box data-cid="Box" data-src="src/App.tsx:3:27"');
  });

  it("binds both runtime entries in one prelude line and skips callsites with an authored data-src", () => {
    const code = `import { Box } from "@ui/components";
import { Card } from "./Card";
export const App = () => <main><Card /><Box data-src="custom" /></main>;`;
    const result = injectIdentity(code, "/project/src/App.tsx", "/project", {
      instrumentComponents: true,
      hostPolicy: {
        components: { Card: { componentId: "src/Card#Card", wrap: true, slots: { children: "rendered" } } },
        diagnostics: [],
      },
    });

    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Card");
    expect(result?.prelude).toContain("instrumentReactComponent as __nudgeUiInstrumentComponent");
    expect(result?.prelude).not.toContain("registerReactCallsites");
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

  it("keeps out-of-root identity project-relative instead of machine-absolute", () => {
    const result = injectIdentity(
      "export function Button() { return <button />; }",
      "/repo/packages/ui/src/Button.tsx",
      "/repo/apps/web",
    );

    expect(result?.code).toContain('data-src="../../packages/ui/src/Button.tsx:1:');
    expect(result?.code).not.toContain("/repo/packages/ui/src/Button.tsx");
  });

  it("traverses children of definitions authored in the same module", () => {
    const code = `import { External } from "@acme/ui";
function Card({ children }: { children: React.ReactNode }) { return <section>{children}</section>; }
function Button() { return <button />; }
export const App = () => <Card><Button /><External><Button /></External></Card>;`;
    const result = injectIdentity(code, "/project/src/App.tsx", "/project", {
      instrumentComponents: true,
    });

    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Card");
    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Button");
    // The unknown package boundary stays opaque, so its subtree is preserved.
    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<External");
    expect(result?.code.match(/__nudgeUiInstrumentComponent\(<Button/g)).toHaveLength(1);
  });

  it("leaves named React fragments free of identity attributes", () => {
    const code = `import React, { Fragment } from "react";
export const App = () => <div><Fragment key="a"><span /></Fragment><React.Fragment><b /></React.Fragment></div>;`;
    const result = injectIdentity(code, "/src/App.tsx", undefined, { instrumentComponents: true });

    expect(result?.code).not.toMatch(/<Fragment[^>]*data-/);
    expect(result?.code).not.toMatch(/<React\.Fragment[^>]*data-/);
    expect(result?.code).toContain("<span data-cid=");
    expect(result?.code).toContain("<b data-cid=");
  });
});
