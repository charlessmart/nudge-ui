import { describe, it, expect } from "vitest";
import { parse } from "@babel/parser";
import {
  resolveHostComponentPolicy,
  type ResolveHostComponentPolicyOptions,
} from "./componentPolicyResolution.ts";
import { defaultReactComponentProtocols } from "./reactComponentProtocols.ts";
import { injectDataCid, injectIdentity } from "./reactIdentity.ts";

async function resolveTestPolicy(
  code: string,
  resolutions: Readonly<Record<string, string>>,
  files: Readonly<Record<string, string>>,
  options: ResolveHostComponentPolicyOptions = {},
) {
  return resolveHostComponentPolicy(code, "/project/src/App.tsx", {
    async resolve(specifier) {
      return resolutions[specifier] ?? null;
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
  }, {
    moduleProtocols: defaultReactComponentProtocols,
    ...options,
  });
}

describe("injectDataCid", () => {
  it("injects data-cid from arrow-function component name", () => {
    const code = `const Button = () => <button>Save</button>;`;
    const res = injectDataCid(code, "/src/Button.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toContain('data-cid="Button"');
  });

  it("injects enclosing component name for nested JSX in a function declaration", () => {
    const code = `function App() { return <div><Button /></div>; }`;
    const res = injectDataCid(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toContain('data-cid="App"');
    expect(res!.code).toContain('data-cid="Button"');
  });

  it("injects data-cid from class-declaration component name", () => {
    const code = `class Card extends Base { render() { return <div>card</div>; } }`;
    const res = injectDataCid(code, "/src/Card.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toContain('data-cid="Card"');
  });

  it("falls back to Anonymous for JSX in a non-component scope", () => {
    const code = `const handleClick = () => <div>hi</div>;`;
    const res = injectDataCid(code, "/src/x.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toContain('data-cid="Anonymous"');
  });

  it("skips files inside node_modules", () => {
    const code = `const Button = () => <button>Save</button>;`;
    const res = injectDataCid(code, "/node_modules/foo/src/Button.tsx");
    expect(res).toBeNull();
  });

  it("skips .ts files (no JSX transform)", () => {
    const code = `export const x = 1;`;
    const res = injectDataCid(code, "/src/utils.ts");
    expect(res).toBeNull();
  });

  it("returns null for CSS input", () => {
    expect(injectDataCid(":root { --a: 1; }", "/src/s.css")).toBeNull();
  });

  it("returns null for JSON input", () => {
    expect(injectDataCid('{"a":1}', "/src/s.json")).toBeNull();
  });

  it("produces a sourcemap covering the edit", () => {
    const code = `const Button = () => <button>Save</button>;`;
    const res = injectDataCid(code, "/src/Button.tsx");
    expect(res).not.toBeNull();
    expect(res!.map).not.toBeNull();
    expect(res!.map!.sources).toContain("/src/Button.tsx");
  });

  it("does not duplicate data-cid on an element that already has it", () => {
    const code = `function App() { return <div><span data-cid="X">a</span></div>; }`;
    const res = injectDataCid(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    const matches = res!.code.match(/data-cid="X"/g);
    expect(matches?.length).toBe(1);
    expect(res!.code).toContain('data-cid="App"');
  });

  it("returns null when nothing was transformed", () => {
    const code = `const x = 1;`;
    const res = injectDataCid(code, "/src/x.tsx");
    expect(res).toBeNull();
  });

  it("resolves data-cid for JSXMemberExpression components", () => {
    const code = `function App() { return <Foo.Bar />; }`;
    const res = injectDataCid(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toContain('data-cid="Foo.Bar"');
  });

  it("falls back to enclosing scope for lowercase HTML elements", () => {
    const code = `function App() { return <div><span>hi</span></div>; }`;
    const res = injectDataCid(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toContain('data-cid="App"');
    expect(res!.code).not.toContain('data-cid="div"');
    expect(res!.code).not.toContain('data-cid="span"');
  });
});

describe("injectIdentity — data-src", () => {
  it("annotates the host definition even when a custom invocation cannot forward props", () => {
    const definition = `export function Button({ label }: { label: string }) { return <button>{label}</button>; }`;
    const result = injectIdentity(definition, "/src/Button.tsx");
    expect(result!.code).toContain('data-cid="Button"');
    expect(result!.code).toContain('data-src="src/Button.tsx:1:');
  });

  it("attributes nested host elements to their enclosing component through a fragment", () => {
    const code = `function Card() { return <><div><span>x</span></div></>; }`;
    const result = injectIdentity(code, "/src/Card.tsx");
    expect(result!.code.match(/data-cid="Card"/g)).toHaveLength(2);
  });

  it("gives repeated render sites distinct definition locations", () => {
    const code = `function List() { return <>{[1].map(x => <span key={x}>{x}</span>)}<span>end</span></>; }`;
    const result = injectIdentity(code, "/src/List.tsx")!.code;
    const sources = [...result.matchAll(/data-src="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(sources).size).toBe(2);
  });

  it("preserves all host-authored identity attributes", () => {
    const code = `function App() { return <div data-cid="Owned" data-src="owned:1:1" data-cprops="owned:true" />; }`;
    expect(injectIdentity(code, "/src/App.tsx")).toBeNull();
  });

  it("injects data-src as relPath:line:col with 1-indexed column", () => {
    const code = `const Button = () => (\n  <button>Save</button>\n);`;
    // line 2, name `button` starts at column 3 (0-indexed) -> 4 (1-indexed)
    const res = injectIdentity(code, "/src/Button.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toContain('data-src="src/Button.tsx:2:4"');
  });

  it("strips a resolved project root prefix", () => {
    const code = `const Button = () => <button>Save</button>;`;
    const res = injectIdentity(code, "/projects/app/src/Button.tsx", "/projects/app");
    expect(res).not.toBeNull();
    expect(res!.code).toContain('data-src="src/Button.tsx:');
  });

  it("emits data-src with leading slash stripped when no root is provided", () => {
    const code = `const Button = () => <button>Save</button>;`;
    const res = injectIdentity(code, "/src/Button.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toMatch(/data-src="src\/Button\.tsx:\d+:\d+"/);
    expect(res!.code).not.toMatch(/data-src="\/src/);
  });

  it("emits data-src on a JSXMemberExpression component", () => {
    const code = `function App() { return <Foo.Bar />; }`;
    const res = injectIdentity(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toMatch(/data-src="src\/App\.tsx:\d+:\d+"/);
  });

  it("places identity attributes after TypeScript JSX type arguments", () => {
    const code = `function App() { return <ButtonLink<RouterProps> variant="primary" />; }`;
    const res = injectIdentity(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toContain(
      '<ButtonLink<RouterProps> data-cid="ButtonLink"',
    );
    expect(res!.code).not.toContain("<ButtonLink data-cid");
  });


});

describe("injectIdentity — data-cprops", () => {
  it("serialises a string literal prop", () => {
    const code = `function App() { return <Button variant="primary">Save</Button>; }`;
    const res = injectIdentity(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toContain('data-cprops="variant:primary"');
  });

  it("serialises a numeric literal prop", () => {
    const code = `function App() { return <Counter count={5}>x</Counter>; }`;
    const res = injectIdentity(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toContain("count:5");
  });

  it("serialises a boolean shorthand prop as key:true", () => {
    const code = `function App() { return <Button primary>x</Button>; }`;
    const res = injectIdentity(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toContain("primary:true");
  });

  it("serialises a boolean literal prop {false}", () => {
    const code = `function App() { return <Button disabled={false}>x</Button>; }`;
    const res = injectIdentity(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toContain("disabled:false");
  });

  it("serialises an inline arrow function prop as fn(name)", () => {
    const code = `function App() { return <Button onClick={() => {}}>x</Button>; }`;
    const res = injectIdentity(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toContain("onClick:fn(onClick)");
  });

  it("omits bare identifier props (PLAN.md canonical example omits onClick={handleClick})", () => {
    const code = `function App() { return <Button onClick={handleClick}>x</Button>; }`;
    const res = injectIdentity(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).not.toContain("onClick:");
    expect(res!.code).not.toMatch(/data-cprops="onClick/);
  });

  it("treats a non-function identifier (string const) as omitted too", () => {
    const code = `function App() { const title = "x"; return <Button title={title} variant="primary">Save</Button>; }`;
    const res = injectIdentity(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).not.toContain("title:fn(title)");
    expect(res!.code).not.toMatch(/title:/);
    expect(res!.code).toContain("variant:primary");
  });

  it("omits object/array/member-expression expression props", () => {
    const code = `function App() { return <Card style={{ color: "red" }} items={[1,2]} onClick={obj.handleClick}>x</Card>; }`;
    const res = injectIdentity(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).not.toContain("style:");
    expect(res!.code).not.toContain("items:");
    expect(res!.code).not.toContain("onClick:fn");
  });

  it("does not emit data-cprops when there are no serialisable props", () => {
    const code = `function App() { return <Card style={{ color: "red" }} {...rest}>x</Card>; }`;
    const res = injectIdentity(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).not.toContain("data-cprops=");
  });

  it("joins multiple serialisable props with a comma, no spaces", () => {
    const code = `function App() { return <Button variant="primary" size="large">Save</Button>; }`;
    const res = injectIdentity(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toContain('data-cprops="variant:primary,size:large"');
  });

  it("escapes quotes in serialised string props", () => {
    const code = `function App() { return <Field placeholder={'{"orientation":"Vertical"}'} />; }`;
    const res = injectIdentity(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toContain(
      "data-cprops=\"placeholder:{&quot;orientation&quot;:&quot;Vertical&quot;}\"",
    );
    expect(() =>
      parse(res!.code, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      }),
    ).not.toThrow();
  });

  it("emits all three attrs together on a realistic Button", () => {
    const code = `function App() { return <Button variant="primary" onClick={() => {}}>Save</Button>; }`;
    const res = injectIdentity(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    expect(res!.code).toContain('data-cid="Button"');
    expect(res!.code).toMatch(/data-src="src\/App\.tsx:\d+:\d+"/);
    expect(res!.code).toContain('data-cprops="variant:primary,onClick:fn(onClick)"');
  });

  it("does not duplicate any of the three attrs on re-run", () => {
    const code = `function App() { return <Button variant="primary">Save</Button>; }`;
    const once = injectIdentity(code, "/src/App.tsx");
    expect(once).not.toBeNull();
    const twice = injectIdentity(once!.code, "/src/App.tsx");
    // Second pass should find all three already present and produce no new injection.
    expect(twice).toBeNull();
  });

  it("skips identity attrs when serialising cprops", () => {
    const code = `function App() { return <Button data-cid="X" variant="primary">Save</Button>; }`;
    const res = injectIdentity(code, "/src/App.tsx");
    expect(res).not.toBeNull();
    // data-cid already present -> not re-injected; variant serialised; identity
    // attr names never appear inside cprops.
    const cidMatches = res!.code.match(/data-cid="X"/g);
    expect(cidMatches?.length).toBe(1);
    expect(res!.code).toContain('data-cprops="variant:primary"');
    expect(res!.code).not.toMatch(/data-cprops="[^"]*data-cid/);
  });
});

describe("injectIdentity — React component invocation instrumentation", () => {
  it("wraps custom component invocations with dev runtime metadata", () => {
    const code = `function App() { return <Button variant="primary" disabled={false}>Save</Button>; } function Button() { return null; }`;
    const result = injectIdentity(code, "/project/src/App.tsx", "/project", {
      instrumentComponents: true,
    });

    expect(result?.code).toContain(
      'import { instrumentReactComponent as __nudgeUiInstrumentComponent } from "@nudge-ui/inspector/component-runtime";',
    );
    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Button");
    expect(result?.code).toContain('"callsiteId":"src/App.tsx:1:26"');
    expect(result?.code).toContain('"componentName":"Button"');
    expect(result?.code).toContain('"componentId":"src/App#Button"');
    expect(result?.code).toContain('"variant":"literal"');
    expect(result?.code).toContain('"disabled":"literal"');
  });

  it("uses an expression container when instrumenting a JSX child", () => {
    const code = `function App() { return <main><Button /></main>; } function Button() { return null; }`;
    const result = injectIdentity(code, "/src/App.tsx", undefined, {
      instrumentComponents: true,
    });
    expect(result?.code).toContain(
      "<main data-cid=\"App\" data-src=\"src/App.tsx:1:26\">{__nudgeUiInstrumentComponent(<Button",
    );
  });

  it("records primitive children authorship in component invocation metadata", () => {
    const literal = injectIdentity(
      `function App() { return <Button>Save</Button>; } function Button() { return null; }`,
      "/src/App.tsx",
      undefined,
      { instrumentComponents: true },
    );
    expect(literal?.code).toContain('"children":"literal"');

    const expression = injectIdentity(
      `function App({ label }: { label: string }) { return <Button>{label}</Button>; } function Button() { return null; }`,
      "/src/App.tsx",
      undefined,
      { instrumentComponents: true },
    );
    expect(expression?.code).toContain('"children":"expression"');

    const spread = injectIdentity(
      `function App({ children }: { children: string[] }) { return <Button>{...children}</Button>; } function Button() { return null; }`,
      "/src/App.tsx",
      undefined,
      { instrumentComponents: true },
    );
    expect(spread?.code).toContain('"children":"spread"');
  });

  it("keeps adjacent component siblings parseable without whitespace", () => {
    const code = `function App() { return <><Meta/><Links/></>; } function Meta() { return null; } function Links() { return null; }`;
    const result = injectIdentity(code, "/src/App.tsx", undefined, {
      instrumentComponents: true,
    });

    expect(() =>
      parse(result!.code, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      }),
    ).not.toThrow();
  });

  it("does not wrap intrinsic host elements", () => {
    const code = `function App() { return <main><span>Hi</span></main>; }`;
    const result = injectIdentity(code, "/src/App.tsx", undefined, {
      instrumentComponents: true,
    });
    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent");
    expect(result?.code).not.toContain("@nudge-ui/inspector/component-runtime");
  });

  it("qualifies imported components by local module or package export", async () => {
    const localSource =
      `import { Button as Action } from "./ui/Button"; export const App = () => <Action />;`;
    const hostPolicy = await resolveTestPolicy(localSource, {
      "./ui/Button": "/project/src/ui/Button.tsx",
    }, {
      "/project/src/ui/Button.tsx": "export function Button() { return <button />; }",
    });
    const local = injectIdentity(
      localSource,
      "/project/src/App.tsx",
      "/project",
      { instrumentComponents: true, hostPolicy },
    );
    expect(local?.code).toContain('"componentId":"src/ui/Button#Button"');

    const packaged = injectIdentity(
      `import { Button } from "@work/design-system"; export const App = () => <Button />;`,
      "/project/src/App.tsx",
      "/project",
      { instrumentComponents: true, compatibleComponentImports: { "@work/design-system": ["Button"] } },
    );
    expect(packaged?.code).toContain('"componentId":"@work/design-system#Button"');
  });

  it("preserves React Router structural exports and instruments the page rendered by a route", async () => {
    const code = `import { Routes as RouteList, Route as Entry } from "react-router-dom";
import { Dashboard } from "./Dashboard";
export const App = () => <RouteList><Entry path="/" element={<Dashboard />} /></RouteList>;`;
    const hostPolicy = await resolveTestPolicy(code, {
      "react-router-dom": "/project/node_modules/react-router-dom/index.js",
      "./Dashboard": "/project/src/Dashboard.tsx",
    }, {
      "/project/src/Dashboard.tsx": "export function Dashboard() { return <main />; }",
    });
    const result = injectIdentity(code, "/project/src/App.tsx", "/project", {
      instrumentComponents: true,
      hostPolicy,
    });

    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<RouteList");
    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<Entry");
    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Dashboard");
    expect(result?.code).toContain('data-src="src/App.tsx:3:');
  });

  it("preserves namespace Router exports even when a compatibility entry is provided", async () => {
    const code = `import * as Router from "react-router";
export const App = () => <Router.Routes><Router.Route path="/" element={<main>Home</main>} /></Router.Routes>;`;
    const hostPolicy = await resolveTestPolicy(code, {
      "react-router": "/project/node_modules/react-router/index.js",
    }, {}, {
      compatibleComponentImports: { "react-router": ["Routes", "Route"] },
    });
    const result = injectIdentity(code, "/src/App.tsx", undefined, {
      instrumentComponents: true,
      hostPolicy,
    });

    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent");
    expect(result?.code).toContain('<main data-cid="App"');
    expect(result?.code).toContain("Home</main>");
  });

  it("requires exact compatibility metadata for package exports", () => {
    const code = `import { Button as Action, Menu } from "@ui/components";
import * as Other from "@other/components";
export const App = () => <main><Action /><Menu /><Other.Button /></main>;`;
    const result = injectIdentity(code, "/src/App.tsx", undefined, {
      instrumentComponents: true,
      compatibleComponentImports: { "@ui/components": ["Button"] },
    });

    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Action");
    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<Menu");
    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<Other.Button");
  });

  it("does not infer safety for an unresolved or shadowed component binding", () => {
    const code = `import { Button } from "./Button";
export function App({ Button }) { return <main><Button /><Unknown /></main>; }`;
    const result = injectIdentity(code, "/src/App.tsx", undefined, { instrumentComponents: true });

    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent");
    expect(result?.code).toContain('data-cid="Button"');
    expect(result?.code).toContain('data-cid="Unknown"');
  });

  it("preserves component values passed as unverified children or slot props", () => {
    const code = `import { Slot } from "unknown-library";
import { Button } from "./Button";
export const App = () => <Slot icon={<Button />}>{true && <><Button /><span>Label</span></>}</Slot>;`;
    const result = injectIdentity(code, "/src/App.tsx", undefined, { instrumentComponents: true });

    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent");
    expect(result?.code).toContain('<span data-cid="App"');
  });

  it("retains component semantics through transparent React render containers", async () => {
    const code = `import React, { Suspense as Pending } from "react";
import { Button, Loading } from "./ui";
export const App = () => <React.Fragment><Pending fallback={<Loading />}><Button /></Pending></React.Fragment>;`;
    const hostPolicy = await resolveTestPolicy(code, {
      react: "/project/node_modules/react/index.js",
      "./ui": "/project/src/ui.tsx",
    }, {
      "/project/src/ui.tsx": [
        "export function Button() { return <button />; }",
        "export function Loading() { return <p />; }",
      ].join("\n"),
    });
    const result = injectIdentity(code, "/src/App.tsx", undefined, {
      instrumentComponents: true,
      hostPolicy,
    });

    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<React.Fragment");
    expect(result?.code).not.toContain("__nudgeUiInstrumentComponent(<Pending");
    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Loading");
    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Button");
  });

  it("recognizes locally defined React memo and forwardRef components", () => {
    const code = `import { forwardRef, memo } from "react";
const Button = memo(forwardRef((props, ref) => <button ref={ref} />));
export const App = () => <Button />;`;
    const result = injectIdentity(code, "/src/App.tsx", undefined, { instrumentComponents: true });

    expect(result?.code).toContain("__nudgeUiInstrumentComponent(<Button");
    expect(result?.code).toContain('<button data-cid=');
  });
});
