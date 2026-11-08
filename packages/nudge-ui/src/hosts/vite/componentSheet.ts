import type { ComponentContract } from "../../compiler/index.ts";
import { NUDGE_UI_COMPONENTS_PATH } from "../../transport/index.ts";
import type { ComponentFrameworkAdapter } from "../componentFramework/adapter.ts";
import { reactComponentFramework } from "../componentFramework/react.ts";
import { serializeSheetDefinition, suggestedSheetWrapperFile } from "../componentFramework/sheet.ts";

export const VIRTUAL_COMPONENT_SHEET_ID = "virtual:nudge-ui-component-sheet";
export const RESOLVED_COMPONENT_SHEET_ID = `\0${VIRTUAL_COMPONENT_SHEET_ID}`;
const COMPONENT_SHEET_SCRIPT_SRC = `/@id/__x00__${VIRTUAL_COMPONENT_SHEET_ID}`;

const STYLESHEET = /\.(?:css|scss|sass|less|styl|stylus|pcss|postcss)(?:$|[?#])/i;
const SCRIPT = /\.(?:[cm]?[jt]sx?)(?:$|[?#])/i;
const CSS_MODULE = /\.module\.[a-z]+(?:$|[?#])/i;
const NON_SIDE_EFFECT_QUERY = /[?&](?:inline|url|raw|worker|sharedworker)(?:&|$|=)/i;

/** The component a virtual sheet module id was requested for, or null for the catalog-wide entry. */
export function componentSheetModuleTarget(id: string): string | null | undefined {
  const [base, query = ""] = id.split("?", 2) as [string, string?];
  if (base !== VIRTUAL_COMPONENT_SHEET_ID && base !== RESOLVED_COMPONENT_SHEET_ID) return undefined;
  return new URLSearchParams(query).get("component");
}

export function isComponentSheetRequest(pathname: string): boolean {
  return pathname === NUDGE_UI_COMPONENTS_PATH;
}

/** The shell the Vite plugin runs through `transformIndexHtml`, so the sheet becomes a Canvas renderer. */
export function createComponentSheetDocument(componentId: string | null = null): string {
  // Each sheet loads only its own component's contract and module, not the whole catalog.
  const src = componentId === null
    ? COMPONENT_SHEET_SCRIPT_SRC
    : `${COMPONENT_SHEET_SCRIPT_SRC}?component=${encodeURIComponent(componentId)}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Components</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${src.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"></script>
  </body>
</html>
`;
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Static imports, re-exports and dynamic `import()` specifiers in source order. */
export function extractModuleSpecifiers(code: string): string[] {
  const source = stripComments(code);
  const found: Array<{ index: number; specifier: string }> = [];
  const patterns = [
    /\bimport\s*(?:[\w*${}\s,]+?\s*from\s*)?["']([^"'\n]+)["']/g,
    /\bexport\s+(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s+from\s*["']([^"'\n]+)["']/g,
    /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
      if (match[1]) found.push({ index: match.index, specifier: match[1] });
    }
  }
  return found.sort((a, b) => a.index - b.index).map((entry) => entry.specifier);
}

/** Module scripts and stylesheet links of an HTML entry, in document order. */
export function extractHtmlEntries(html: string): Array<
  | { kind: "module"; src: string }
  | { kind: "inline"; code: string }
  | { kind: "stylesheet"; href: string }
> {
  const entries: Array<{ index: number; value: ReturnType<typeof extractHtmlEntries>[number] }> = [];
  const scripts = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scripts.exec(html))) {
    const attributes = match[1] ?? "";
    if (!/\btype\s*=\s*["']?module["']?/i.test(attributes)) continue;
    const src = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes);
    const value = src
      ? { kind: "module" as const, src: src[1] ?? src[2] ?? "" }
      : { kind: "inline" as const, code: match[2] ?? "" };
    entries.push({ index: match.index, value });
  }
  const links = /<link\b([^>]*)>/gi;
  while ((match = links.exec(html))) {
    const attributes = match[1] ?? "";
    if (!/\brel\s*=\s*["']?stylesheet["']?/i.test(attributes)) continue;
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes);
    const target = href?.[1] ?? href?.[2];
    if (target) entries.push({ index: match.index, value: { kind: "stylesheet", href: target } });
  }
  return entries.sort((a, b) => a.index - b.index).map((entry) => entry.value);
}

export interface SheetStyleGraphDependencies {
  /** Null when the file cannot be read. */
  read(file: string): string | null;
  resolve(specifier: string, importer: string): Promise<string | null>;
  /** Only project source files are walked; stylesheets are collected wherever they resolve. */
  isProjectSource(file: string): boolean;
}

function stripQuery(id: string): string {
  return id.split(/[?#]/, 1)[0] ?? id;
}

/**
 * Global stylesheets in first-seen order, found by walking the import graph of the HTML entry scripts.
 * Stylesheets that resolve into node_modules are collected but never walked.
 */
export async function collectSheetStyleImports(
  html: { file: string; source: string },
  dependencies: SheetStyleGraphDependencies,
): Promise<string[]> {
  const styles: string[] = [];
  const seenStyles = new Set<string>();
  const visited = new Set<string>();

  function addStyle(file: string): void {
    if (seenStyles.has(file)) return;
    seenStyles.add(file);
    styles.push(file);
  }

  async function visitSpecifiers(specifiers: readonly string[], importer: string): Promise<void> {
    for (const specifier of specifiers) {
      let resolved: string | null = null;
      try {
        resolved = await dependencies.resolve(specifier, importer);
      } catch {
        // An unresolvable specifier simply contributes nothing.
      }
      if (!resolved || resolved.startsWith("\0")) continue;
      if (STYLESHEET.test(resolved)) {
        if (CSS_MODULE.test(resolved) || NON_SIDE_EFFECT_QUERY.test(resolved)) continue;
        addStyle(stripQuery(resolved));
        continue;
      }
      const file = stripQuery(resolved);
      if (!SCRIPT.test(file) || !dependencies.isProjectSource(file)) continue;
      await visitFile(file);
    }
  }

  async function visitFile(file: string): Promise<void> {
    if (visited.has(file)) return;
    visited.add(file);
    const code = dependencies.read(file);
    if (code === null) return;
    await visitSpecifiers(extractModuleSpecifiers(code), file);
  }

  for (const entry of extractHtmlEntries(html.source)) {
    if (entry.kind === "module") await visitSpecifiers([entry.src], html.file);
    else if (entry.kind === "inline") await visitSpecifiers(extractModuleSpecifiers(entry.code), html.file);
    else await visitSpecifiers([entry.href], html.file);
  }
  return styles;
}

export interface ComponentSheetEntryInput {
  contracts: readonly ComponentContract[];
  /** Specifiers imported first, in order. */
  styles: readonly string[];
  /** Absolute path of the file whose default export wraps every cell, when the project has one. */
  wrapper?: string | null;
  /** Project-relative path shown in the setup prompt: the existing wrapper, else where one would go. */
  wrapperPath?: string;
  /** Project-relative contract files that exist on disk resolve to their absolute path. */
  projectFile(contract: ComponentContract): string | null;
  /** Defaults to the React adapter, the only framework with a sheet renderer today. */
  framework?: ComponentFrameworkAdapter;
}

/** Vite serves files outside its module graph's URL space through `/@fs/`. */
function fsSpecifier(file: string): string {
  return `/@fs/${file.replace(/\\/g, "/").replace(/^\//, "")}`;
}

/** The module source behind the virtual sheet entry. */
export function serializeComponentSheetEntry(input: ComponentSheetEntryInput): string {
  const framework = input.framework ?? reactComponentFramework;
  const runtime = framework.runtimeModules.sheet;
  if (runtime === null) throw new Error(`[nudge-ui] ${framework.label} has no component sheet renderer.`);
  return [
    ...input.styles.map((style) => `import ${JSON.stringify(style)};`),
    `import { mountComponentSheet } from ${JSON.stringify(runtime)};`,
    "mountComponentSheet({",
    ...serializeSheetDefinition({
      contracts: input.contracts,
      componentSpecifier(contract) {
        const file = input.projectFile(contract);
        return file === null ? contract.file : fsSpecifier(file);
      },
      wrapperSpecifier: input.wrapper ? fsSpecifier(input.wrapper) : null,
      wrapperPath: input.wrapperPath ?? suggestedSheetWrapperFile(framework),
    }),
    '  componentId: new URLSearchParams(window.location.search).get("component"),',
    "});",
    "",
  ].join("\n");
}
