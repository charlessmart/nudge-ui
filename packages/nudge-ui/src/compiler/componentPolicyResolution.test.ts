import { describe, expect, it } from "vitest";
import {
  formatComponentPolicyWarning,
  groupComponentPolicyDiagnostics,
  resolveHostComponentPolicy,
  type ComponentModuleAdapter,
  type ComponentModuleProtocols,
} from "./componentPolicyResolution.ts";
import { defaultReactComponentProtocols } from "./reactComponentProtocols.ts";
import { injectIdentity } from "./reactIdentity.ts";

const STRUCTURAL_PROTOCOLS = {
  "structural-library": {
    default: { wrap: false },
    exports: {
      Provider: { wrap: false, slots: { children: "rendered" } },
      Item: { wrap: false, slots: { content: "rendered" } },
    },
  },
} satisfies ComponentModuleProtocols;

function moduleAdapter(files: Readonly<Record<string, string>>): ComponentModuleAdapter {
  return {
    async resolve(specifier, importer) {
      if (specifier === "@/Button") return "/project/src/Button.tsx";
      if (specifier === "@/Card") return "/project/src/Card.tsx";
      if (specifier === "./Button") return "/project/src/Button.tsx";
      if (specifier === "./structural") return "/project/src/structural.ts";
      if (specifier === "./Page") return "/project/src/Page.tsx";
      if (specifier === "structural-library") return "/project/node_modules/structural-library/index.js";
      throw new Error(`Unexpected resolution request ${specifier} from ${importer}`);
    },
    async read(id) {
      return files[id] ?? null;
    },
    isProjectSource(id) {
      return id.startsWith("/project/src/");
    },
    sourcePath(id) {
      return id.slice("/project/".length);
    },
  };
}

describe("host component policy resolution", () => {
  it("instruments an aliased component that resolves to project source", async () => {
    const source = 'import { Button } from "@/Button"; export const App = () => <Button />;';
    const hostPolicy = await resolveHostComponentPolicy(
      source,
      "/project/src/App.tsx",
      moduleAdapter({
        "/project/src/Button.tsx": "export function Button() { return <button />; }",
      }),
    );

    const result = injectIdentity(source, "/project/src/App.tsx", "/project", {
      instrumentComponents: true,
      hostPolicy,
    });

    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Button");
    expect(result?.code).toContain('"componentId":"src/Button#Button"');
    expect(hostPolicy.diagnostics).toEqual([]);
  });

  it("preserves a structural export reached through a project barrel", async () => {
    const source = [
      'import { Provider, Item } from "./structural";',
      'import { Page } from "./Page";',
      "export const App = () => <Provider><Item content={<Page />} /></Provider>;",
    ].join("\n");
    const hostPolicy = await resolveHostComponentPolicy(
      source,
      "/project/src/App.tsx",
      moduleAdapter({
        "/project/src/structural.ts": [
          'import Structural from "structural-library";',
          "export const Provider = Structural.Provider;",
          'export { Item } from "structural-library";',
        ].join("\n"),
        "/project/src/Page.tsx": "export function Page() { return <main />; }",
      }),
      { moduleProtocols: STRUCTURAL_PROTOCOLS },
    );

    const result = injectIdentity(source, "/project/src/App.tsx", "/project", {
      instrumentComponents: true,
      hostPolicy,
    });

    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<Provider");
    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<Item");
    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Page");
  });

  it("applies the default structural policy through aliased React Router re-exports", async () => {
    const source = [
      'import { Routes, Route } from "./router";',
      'import { Page } from "./Page";',
      'export const App = () => <Routes><Route path="/" element={<Page />} /></Routes>;',
    ].join("\n");
    const adapter = moduleAdapter({
      "/project/src/structural.ts": 'export { Routes, Route } from "react-router-dom";',
      "/project/src/Page.tsx": "export function Page() { return <main />; }",
    });
    const hostPolicy = await resolveHostComponentPolicy(source, "/project/src/App.tsx", {
      ...adapter,
      async resolve(specifier, importer) {
        if (specifier === "./router") return "/project/src/structural.ts";
        if (specifier === "react-router-dom") {
          return "/project/node_modules/react-router-dom/index.js";
        }
        return adapter.resolve(specifier, importer);
      },
    }, { moduleProtocols: defaultReactComponentProtocols });

    const result = injectIdentity(source, "/project/src/App.tsx", "/project", {
      instrumentComponents: true,
      hostPolicy,
    });

    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<Routes");
    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<Route");
    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Page");
  });

  it("keeps an unknown package subtree unchanged and reports why", async () => {
    const source = [
      'import { Slot } from "unknown-library";',
      'import { Page } from "./Page";',
      "export const App = () => <Slot><Page /></Slot>;",
    ].join("\n");
    const adapter = moduleAdapter({
      "/project/src/Page.tsx": "export function Page() { return <main />; }",
    });
    const hostPolicy = await resolveHostComponentPolicy(source, "/project/src/App.tsx", {
      ...adapter,
      async resolve(specifier, importer) {
        if (specifier === "unknown-library") return "/project/node_modules/unknown-library/index.js";
        return adapter.resolve(specifier, importer);
      },
    });

    const result = injectIdentity(source, "/project/src/App.tsx", "/project", {
      instrumentComponents: true,
      hostPolicy,
    });

    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent");
    expect(hostPolicy.diagnostics).toContainEqual(expect.objectContaining({
      code: "component-protocol-unknown",
      componentName: "Slot",
      source: "unknown-library",
    }));
  });

  it("allows explicit package compatibility without making child slots transparent", async () => {
    const source = [
      'import { Card } from "@acme/design";',
      'import { Page } from "./Page";',
      "export const App = () => <Card><Page /></Card>;",
    ].join("\n");
    const adapter = moduleAdapter({
      "/project/src/Page.tsx": "export function Page() { return <main />; }",
    });
    const hostPolicy = await resolveHostComponentPolicy(source, "/project/src/App.tsx", {
      ...adapter,
      async resolve(specifier, importer) {
        if (specifier === "@acme/design") return "/project/node_modules/@acme/design/index.js";
        return adapter.resolve(specifier, importer);
      },
    }, {
      compatibleComponentImports: { "@acme/design": ["Card"] },
    });

    const result = injectIdentity(source, "/project/src/App.tsx", "/project", {
      instrumentComponents: true,
      hostPolicy,
    });

    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Card");
    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<Page");
  });

  it("traverses children of project-owned components by default", async () => {
    const source = [
      'import { Card } from "@/Card";',
      'import { Button } from "./Button";',
      "export const App = () => <Card><Button /></Card>;",
    ].join("\n");
    const hostPolicy = await resolveHostComponentPolicy(source, "/project/src/App.tsx", moduleAdapter({
      "/project/src/Card.tsx": "export function Card({ children }) { return <section>{children}</section>; }",
      "/project/src/Button.tsx": "export function Button() { return <button />; }",
    }));

    const result = injectIdentity(source, "/project/src/App.tsx", "/project", {
      instrumentComponents: true,
      hostPolicy,
    });

    expect(hostPolicy.components.Card).toMatchObject({
      wrap: true,
      slots: { children: "rendered" },
      componentId: "src/Card#Card",
    });
    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Card");
    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Button");
  });

  it("lets a host protocol override the project-owned default", async () => {
    const source = 'import { Card } from "@/Card"; export const App = () => <Card />;';
    const hostPolicy = await resolveHostComponentPolicy(source, "/project/src/App.tsx", moduleAdapter({
      "/project/src/Card.tsx": "export function Card() { return <section />; }",
    }), {
      moduleProtocols: { "src/Card": { default: { wrap: false } } },
    });

    const result = injectIdentity(source, "/project/src/App.tsx", "/project", {
      instrumentComponents: true,
      hostPolicy,
    });

    expect(hostPolicy.components.Card?.wrap).toBe(false);
    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent");
  });

  it("groups diagnostics once per source with stable dedupe keys", () => {
    const grouped = groupComponentPolicyDiagnostics([
      {
        code: "component-protocol-unknown",
        componentName: "Alpha",
        source: "acme-ui",
        exportName: "Alpha",
      },
      {
        code: "component-protocol-unknown",
        componentName: "Beta",
        source: "acme-ui",
        exportName: "Beta",
      },
      {
        code: "component-import-unresolved",
        componentName: "Gamma",
        source: "acme-ui",
        exportName: "Gamma",
      },
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({
      source: "acme-ui",
      componentNames: ["Alpha", "Beta"],
      total: 2,
    });
    expect(formatComponentPolicyWarning(grouped[0]!, "src/App.tsx"))
      .toContain("Semantic instrumentation skipped acme-ui in src/App.tsx (Alpha, Beta)");
  });
});
