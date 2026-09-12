import { parse } from "@babel/parser";

/** Whether replacing a JSX element type with the semantic boundary is safe. */
export interface ComponentProtocol {
  readonly wrap: boolean;
  /**
   * JSX-valued slots where the compiler may apply each descendant's resolved
   * protocol. A component that resolves to project-owned source defaults to
   * `wrap: true` with `children: "rendered"`; every other slot stays opaque
   * until a host declares it.
   */
  readonly slots?: Readonly<Record<string, "rendered" | "opaque">>;
}

/** Component protocols exported by one canonical module specifier. */
export interface ComponentModuleProtocol {
  readonly default?: ComponentProtocol;
  readonly exports?: Readonly<Record<string, ComponentProtocol>>;
}

export interface ComponentModuleProtocols {
  readonly [source: string]: ComponentModuleProtocol | undefined;
}

interface MutableComponentModuleProtocols {
  [source: string]: ComponentModuleProtocol | undefined;
}

/** Build-tool operations needed to resolve an authored import to its defining module. */
export interface ComponentModuleAdapter {
  resolve(specifier: string, importer: string): Promise<string | null>;
  read(id: string): Promise<string | null>;
  isProjectSource(id: string): boolean;
  /** Stable, machine-independent path used by component contracts and callsite identity. */
  sourcePath(id: string): string;
}

export interface ResolvedComponentProtocol extends ComponentProtocol {
  readonly componentId: string;
}

export type ComponentPolicyDiagnosticCode =
  | "component-import-unresolved"
  | "component-protocol-unknown"
  | "component-export-unresolved";

export interface ComponentPolicyDiagnostic {
  readonly code: ComponentPolicyDiagnosticCode;
  readonly componentName: string;
  readonly source: string;
  readonly exportName: string;
  readonly message: string;
}

/** Data-only policy consumed by the source compiler after a host resolves imports. */
export interface HostComponentPolicy {
  readonly components: Readonly<Record<string, ResolvedComponentProtocol>>;
  readonly diagnostics: readonly ComponentPolicyDiagnostic[];
}

export interface ResolveHostComponentPolicyOptions {
  readonly moduleProtocols?: ComponentModuleProtocols;
  /** Backwards-compatible shorthand: these exports may be wrapped but expose no rendered slots. */
  readonly compatibleComponentImports?: Readonly<Record<string, readonly string[]>>;
}

/** Merge a host's protocol additions over a shared compatibility catalog. */
export function mergeComponentModuleProtocols(
  defaults: ComponentModuleProtocols,
  overrides: ComponentModuleProtocols | undefined,
): ComponentModuleProtocols {
  if (!overrides) return defaults;
  const merged: MutableComponentModuleProtocols = { ...defaults };
  for (const [source, override] of Object.entries(overrides)) {
    if (!override) continue;
    const fallback = defaults[source];
    merged[source] = {
      ...fallback,
      ...override,
      exports: {
        ...fallback?.exports,
        ...override.exports,
      },
    };
  }
  return merged;
}

type SyntaxNode = {
  type: string;
  [key: string]: unknown;
};

interface ImportBinding {
  readonly source: string;
  readonly exportName: string;
  readonly namespace: boolean;
}

interface ModuleAnalysis {
  readonly imports: Map<string, ImportBinding>;
  readonly declarations: Map<string, SyntaxNode>;
  readonly exports: Map<string, ExportTarget>;
  readonly exportAll: string[];
  /** Imported JSX component names used by this module, sorted for determinism. */
  readonly importedJsxNames: string[];
}

type ExportTarget =
  | { readonly kind: "request"; readonly source: string; readonly exportName: string }
  | { readonly kind: "local"; readonly localName: string }
  | { readonly kind: "definition"; readonly node: SyntaxNode };

type TraceResult =
  | { readonly resolved: true; readonly protocol: ResolvedComponentProtocol }
  | {
      readonly resolved: false;
      readonly code: ComponentPolicyDiagnosticCode;
      readonly source: string;
      readonly exportName: string;
    };

type ExpressionReference =
  | { readonly kind: "local"; readonly localName: string }
  | { readonly kind: "request"; readonly source: string; readonly exportName: string };

const SKIP_KEYS = new Set([
  "type",
  "loc",
  "range",
  "start",
  "end",
  "extra",
  "leadingComments",
  "trailingComments",
  "innerComments",
]);

const MAX_REEXPORT_DEPTH = 24;

/**
 * Analyses are a pure function of module source, so a content-addressed cache
 * is correct across HMR without host-specific invalidation: an edited file
 * simply misses and is re-analysed, while every unchanged re-export target
 * skips its parse. Without this, policy resolution reparses every reachable
 * module on every transform.
 */
const ANALYSIS_CACHE_LIMIT = 128;
const analysisCache = new Map<string, ModuleAnalysis | null>();

function analyseModuleSource(code: string): ModuleAnalysis | null {
  const cached = analysisCache.get(code);
  if (cached !== undefined) return cached;
  const ast = parseModule(code);
  const analysis = ast ? analyseModule(ast) : null;
  if (analysisCache.size >= ANALYSIS_CACHE_LIMIT) {
    const oldest = analysisCache.keys().next();
    if (!oldest.done) analysisCache.delete(oldest.value);
  }
  analysisCache.set(code, analysis);
  return analysis;
}

/**
 * Resolve the imported JSX values used by one source file.
 *
 * The compiler owns syntax and re-export traversal. The host Adapter owns all
 * build-tool resolution, source ownership, and stable path decisions.
 */
export async function resolveHostComponentPolicy(
  code: string,
  importer: string,
  adapter: ComponentModuleAdapter,
  options: ResolveHostComponentPolicyOptions = {},
): Promise<HostComponentPolicy> {
  const analysis = analyseModuleSource(code);
  if (!analysis) {
    return { components: {}, diagnostics: [] };
  }

  const components: Record<string, ResolvedComponentProtocol> = {};
  const diagnostics: ComponentPolicyDiagnostic[] = [];

  for (const componentName of analysis.importedJsxNames) {
    const reference = importedReference(componentName, analysis.imports);
    if (!reference) continue;
    const result = await traceRequest(
      reference.source,
      reference.exportName,
      importer,
      adapter,
      options,
      new Set(),
      0,
    );
    if (result.resolved) {
      components[componentName] = result.protocol;
      continue;
    }
    diagnostics.push({
      code: result.code,
      componentName,
      source: reference.source,
      exportName: reference.exportName,
      message: diagnosticMessage(result.code, componentName, reference.source, reference.exportName),
    });
  }

  return { components, diagnostics };
}

function parseModule(code: string): SyntaxNode | null {
  try {
    return parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    }) as unknown as SyntaxNode;
  } catch {
    return null;
  }
}

function isNode(value: unknown): value is SyntaxNode {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, "type") === "string";
}

function identifier(node: unknown): string | null {
  if (!isNode(node) || (node.type !== "Identifier" && node.type !== "StringLiteral")) return null;
  return typeof node.name === "string" ? node.name : typeof node.value === "string" ? node.value : null;
}

function jsxName(node: unknown): string | null {
  if (!isNode(node)) return null;
  if (node.type === "JSXIdentifier") return typeof node.name === "string" ? node.name : null;
  if (node.type !== "JSXMemberExpression") return null;
  const object = jsxName(node.object);
  const property = jsxName(node.property);
  return object && property ? `${object}.${property}` : null;
}

function visit(node: SyntaxNode, callback: (node: SyntaxNode) => void): void {
  callback(node);
  for (const [key, value] of Object.entries(node)) {
    if (SKIP_KEYS.has(key)) continue;
    if (isNode(value)) visit(value, callback);
    else if (Array.isArray(value)) value.filter(isNode).forEach((child) => visit(child, callback));
  }
}

function analyseModule(ast: SyntaxNode): ModuleAnalysis {
  const program = isNode(ast.program) ? ast.program : ast;
  const imports = new Map<string, ImportBinding>();
  const declarations = new Map<string, SyntaxNode>();
  const exports = new Map<string, ExportTarget>();
  const exportAll: string[] = [];

  for (const statement of (program.body as SyntaxNode[] | undefined) ?? []) {
    if (statement.type === "ImportDeclaration") {
      recordImports(statement, imports);
      continue;
    }
    recordDeclaration(statement, declarations);
    if (statement.type === "ExportDefaultDeclaration") {
      const declaration = statement.declaration;
      if (isNode(declaration)) {
        const localName = identifier(declaration);
        exports.set("default", localName
          ? { kind: "local", localName }
          : { kind: "definition", node: declaration });
      }
      continue;
    }
    if (statement.type === "ExportAllDeclaration") {
      const source = isNode(statement.source) ? String(statement.source.value ?? "") : "";
      if (source) exportAll.push(source);
      continue;
    }
    if (statement.type !== "ExportNamedDeclaration") continue;
    const source = isNode(statement.source) ? String(statement.source.value ?? "") : null;
    const declaration = isNode(statement.declaration) ? statement.declaration : null;
    if (declaration) {
      recordDeclaration(declaration, declarations);
      for (const name of declaredNames(declaration)) {
        exports.set(name, { kind: "local", localName: name });
      }
    }
    for (const specifier of (statement.specifiers as SyntaxNode[] | undefined) ?? []) {
      const exportedName = identifier(specifier.exported);
      const localName = identifier(specifier.local);
      if (!exportedName || !localName) continue;
      exports.set(exportedName, source
        ? { kind: "request", source, exportName: localName }
        : { kind: "local", localName });
    }
  }

  return {
    imports,
    declarations,
    exports,
    exportAll,
    importedJsxNames: collectImportedJsxNames(ast, imports),
  };
}

function recordImports(statement: SyntaxNode, imports: Map<string, ImportBinding>): void {
  if (statement.importKind === "type" || !isNode(statement.source)) return;
  const source = String(statement.source.value ?? "");
  for (const specifier of (statement.specifiers as SyntaxNode[] | undefined) ?? []) {
    if (specifier.importKind === "type") continue;
    const localName = identifier(specifier.local);
    if (!localName) continue;
    imports.set(localName, {
      source,
      exportName: specifier.type === "ImportDefaultSpecifier" ? "default" : identifier(specifier.imported) ?? "*",
      namespace: specifier.type === "ImportNamespaceSpecifier",
    });
  }
}

function recordDeclaration(statement: SyntaxNode, declarations: Map<string, SyntaxNode>): void {
  if (statement.type === "FunctionDeclaration" || statement.type === "ClassDeclaration") {
    const name = identifier(statement.id);
    if (name) declarations.set(name, statement);
    return;
  }
  if (statement.type !== "VariableDeclaration") return;
  for (const declaration of (statement.declarations as SyntaxNode[] | undefined) ?? []) {
    const name = identifier(declaration.id);
    if (name) declarations.set(name, declaration);
  }
}

function declaredNames(declaration: SyntaxNode): string[] {
  if (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") {
    const name = identifier(declaration.id);
    return name ? [name] : [];
  }
  if (declaration.type !== "VariableDeclaration") return [];
  return ((declaration.declarations as SyntaxNode[] | undefined) ?? [])
    .map((item) => identifier(item.id))
    .filter((name): name is string => name !== null);
}

function collectImportedJsxNames(ast: SyntaxNode, imports: ReadonlyMap<string, ImportBinding>): string[] {
  const names = new Set<string>();
  visit(ast, (node) => {
    if (node.type !== "JSXOpeningElement") return;
    const name = jsxName(node.name);
    const root = name?.split(".")[0];
    if (name && root && /^[A-Z]/.test(root) && imports.has(root)) names.add(name);
  });
  return [...names].sort();
}

function importedReference(
  componentName: string,
  imports: ReadonlyMap<string, ImportBinding>,
): { source: string; exportName: string } | null {
  const [root, ...members] = componentName.split(".");
  const binding = root ? imports.get(root) : undefined;
  if (!binding) return null;
  const exportName = binding.namespace
    ? members.join(".")
    : [binding.exportName, ...members].filter(Boolean).join(".");
  if (!exportName || exportName === "*") return null;
  return { source: binding.source, exportName };
}

async function traceRequest(
  source: string,
  exportName: string,
  importer: string,
  adapter: ComponentModuleAdapter,
  options: ResolveHostComponentPolicyOptions,
  visited: Set<string>,
  depth: number,
): Promise<TraceResult> {
  const declared = declaredProtocol(source, exportName, options);
  if (declared) return resolvedProtocol(source, exportName, declared);
  if (depth >= MAX_REEXPORT_DEPTH) {
    return { resolved: false, code: "component-export-unresolved", source, exportName };
  }

  let resolvedId: string | null;
  try {
    resolvedId = await adapter.resolve(source, importer);
  } catch {
    resolvedId = null;
  }
  if (!resolvedId) {
    return { resolved: false, code: "component-import-unresolved", source, exportName };
  }
  if (!adapter.isProjectSource(resolvedId)) {
    return { resolved: false, code: "component-protocol-unknown", source, exportName };
  }

  const canonicalSource = stripModuleExtension(adapter.sourcePath(resolvedId));
  const canonicalProtocol = declaredProtocol(canonicalSource, exportName, options);
  if (canonicalProtocol) return resolvedProtocol(canonicalSource, exportName, canonicalProtocol);

  const visitKey = `${resolvedId}\0${exportName}`;
  if (visited.has(visitKey)) {
    return { resolved: false, code: "component-export-unresolved", source, exportName };
  }
  const nextVisited = new Set(visited).add(visitKey);
  const moduleSource = await adapter.read(resolvedId);
  if (moduleSource === null) {
    return { resolved: false, code: "component-export-unresolved", source, exportName };
  }
  const analysis = analyseModuleSource(moduleSource);
  if (!analysis) {
    return { resolved: false, code: "component-export-unresolved", source, exportName };
  }
  return traceProjectExport(
    analysis,
    resolvedId,
    canonicalSource,
    exportName,
    adapter,
    options,
    nextVisited,
    depth + 1,
  );
}

async function traceProjectExport(
  analysis: ModuleAnalysis,
  moduleId: string,
  canonicalSource: string,
  exportName: string,
  adapter: ComponentModuleAdapter,
  options: ResolveHostComponentPolicyOptions,
  visited: Set<string>,
  depth: number,
): Promise<TraceResult> {
  const target = analysis.exports.get(exportName);
  if (target?.kind === "request") {
    return traceRequest(target.source, target.exportName, moduleId, adapter, options, visited, depth);
  }
  if (target?.kind === "definition") {
    return traceDefinition(
      analysis,
      moduleId,
      canonicalSource,
      target.node,
      exportName,
      adapter,
      options,
      visited,
      depth,
    );
  }
  if (target?.kind === "local") {
    return traceLocal(
      analysis,
      moduleId,
      canonicalSource,
      target.localName,
      exportName,
      adapter,
      options,
      visited,
      depth,
    );
  }

  const candidates: TraceResult[] = [];
  for (const source of analysis.exportAll) {
    const candidate = await traceRequest(source, exportName, moduleId, adapter, options, visited, depth);
    if (candidate.resolved) candidates.push(candidate);
  }
  if (candidates.length === 1) return candidates[0]!;
  return { resolved: false, code: "component-export-unresolved", source: canonicalSource, exportName };
}

function traceDefinition(
  analysis: ModuleAnalysis,
  moduleId: string,
  canonicalSource: string,
  definition: SyntaxNode,
  exportedName: string,
  adapter: ComponentModuleAdapter,
  options: ResolveHostComponentPolicyOptions,
  visited: Set<string>,
  depth: number,
): Promise<TraceResult> | TraceResult {
  const reference = expressionReference(definition, analysis.imports);
  if (!reference) return projectProtocol(canonicalSource, exportedName);
  if (reference.kind === "local") {
    return traceLocal(
      analysis,
      moduleId,
      canonicalSource,
      reference.localName,
      exportedName,
      adapter,
      options,
      visited,
      depth,
    );
  }
  return traceRequest(reference.source, reference.exportName, moduleId, adapter, options, visited, depth);
}

async function traceLocal(
  analysis: ModuleAnalysis,
  moduleId: string,
  canonicalSource: string,
  localName: string,
  exportedName: string,
  adapter: ComponentModuleAdapter,
  options: ResolveHostComponentPolicyOptions,
  visited: Set<string>,
  depth: number,
): Promise<TraceResult> {
  const imported = analysis.imports.get(localName);
  if (imported && !imported.namespace) {
    return traceRequest(imported.source, imported.exportName, moduleId, adapter, options, visited, depth);
  }

  const declaration = analysis.declarations.get(localName);
  if (!declaration) {
    return { resolved: false, code: "component-export-unresolved", source: canonicalSource, exportName: exportedName };
  }
  if (declaration.type !== "VariableDeclarator") return projectProtocol(canonicalSource, exportedName);
  const reference = expressionReference(declaration.init, analysis.imports);
  if (!reference) return projectProtocol(canonicalSource, exportedName);
  if (reference.kind === "local") {
    return traceLocal(
      analysis,
      moduleId,
      canonicalSource,
      reference.localName,
      exportedName,
      adapter,
      options,
      visited,
      depth,
    );
  }
  return traceRequest(reference.source, reference.exportName, moduleId, adapter, options, visited, depth);
}

function expressionReference(
  expression: unknown,
  imports: ReadonlyMap<string, ImportBinding>,
): ExpressionReference | null {
  let current = isNode(expression) ? expression : null;
  while (current && ["TSAsExpression", "TSTypeAssertion", "TSNonNullExpression"].includes(current.type)) {
    current = isNode(current.expression) ? current.expression : null;
  }
  if (!current) return null;
  if (current.type === "Identifier") {
    const name = identifier(current);
    if (!name) return null;
    const imported = imports.get(name);
    return imported && !imported.namespace
      ? { kind: "request", source: imported.source, exportName: imported.exportName }
      : { kind: "local", localName: name };
  }
  if (current.type !== "MemberExpression") return null;
  const object = identifier(current.object);
  const property = identifier(current.property);
  const imported = object ? imports.get(object) : undefined;
  if (!imported || !property) return null;
  return {
    kind: "request",
    source: imported.source,
    exportName: imported.namespace ? property : `${imported.exportName}.${property}`,
  };
}

function declaredProtocol(
  source: string,
  exportName: string,
  options: ResolveHostComponentPolicyOptions,
): ComponentProtocol | null {
  const moduleProtocol = options.moduleProtocols?.[source];
  const normalizedExportName = exportName.replace(/^default\./, "");
  const protocol = moduleProtocol?.exports?.[exportName]
    ?? moduleProtocol?.exports?.[normalizedExportName]
    ?? moduleProtocol?.default;
  if (protocol) return protocol;
  return options.compatibleComponentImports?.[source]?.includes(exportName) === true
    ? { wrap: true }
    : null;
}

function resolvedProtocol(
  source: string,
  exportName: string,
  protocol: ComponentProtocol,
): TraceResult {
  return {
    resolved: true,
    protocol: {
      ...protocol,
      componentId: `${stripModuleExtension(source)}#${exportName}`,
    },
  };
}

/**
 * Default protocol for a component that resolves to project-owned source.
 *
 * The inspected codebase owns the definition, so replacing the element type is
 * safe and its authored `children` may be traversed. Named JSX props stay
 * opaque: only a host-declared protocol can promise that a named slot renders
 * its contents.
 */
function projectProtocol(source: string, exportName: string): TraceResult {
  return resolvedProtocol(source, exportName, { wrap: true, slots: { children: "rendered" } });
}

function stripModuleExtension(value: string): string {
  return value.replace(/\.(?:d\.)?[cm]?[jt]sx?$/, "");
}

/** One actionable message per diagnostic code and source. */
export interface GroupedComponentPolicyDiagnostic {
  /** Stable dedupe key for host-side "warn once" tracking. */
  readonly key: string;
  readonly source: string;
  readonly componentNames: readonly string[];
  readonly total: number;
}

/**
 * Roll per-component diagnostics up so a host emits one warning per package
 * instead of one per skipped export.
 */
export function groupComponentPolicyDiagnostics(
  diagnostics: readonly ComponentPolicyDiagnostic[],
  maxNames = 5,
): GroupedComponentPolicyDiagnostic[] {
  const groups = new Map<string, ComponentPolicyDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}\0${diagnostic.source}`;
    const group = groups.get(key);
    if (group) group.push(diagnostic);
    else groups.set(key, [diagnostic]);
  }
  return [...groups].map(([key, group]) => ({
    key,
    source: group[0]!.source,
    componentNames: group.slice(0, maxNames).map((diagnostic) => diagnostic.componentName),
    total: group.length,
  }));
}

/** Host-facing warning text for one grouped diagnostic. */
export function formatComponentPolicyWarning(
  grouped: GroupedComponentPolicyDiagnostic,
  location: string,
  hint = "Add componentProtocols metadata to opt in compatible package exports.",
): string {
  const names = grouped.componentNames.join(", ");
  const remainder = grouped.total > grouped.componentNames.length
    ? ` and ${grouped.total - grouped.componentNames.length} more`
    : "";
  return `[nudge-ui] Semantic instrumentation skipped ${grouped.source} in ${location} `
    + `(${names}${remainder}). ${hint}`;
}

function diagnosticMessage(
  code: ComponentPolicyDiagnosticCode,
  componentName: string,
  source: string,
  exportName: string,
): string {
  if (code === "component-import-unresolved") {
    return `Semantic instrumentation skipped ${componentName}: ${source} could not be resolved by the host Adapter.`;
  }
  if (code === "component-protocol-unknown") {
    return `Semantic instrumentation skipped ${componentName}: ${source}#${exportName} has no compatible component protocol.`;
  }
  return `Semantic instrumentation skipped ${componentName}: ${source}#${exportName} could not be traced to a component definition.`;
}
