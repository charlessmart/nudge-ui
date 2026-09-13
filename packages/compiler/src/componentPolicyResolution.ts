import {
  childNodes,
  identifier,
  isNode,
  jsxMemberName,
  parseModule,
  type SyntaxNode,
} from "./ast.ts";
import { stripModuleExtension } from "./sourcePaths.ts";

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
  | { readonly resolved: false; readonly code: ComponentPolicyDiagnosticCode };

/** A resolution failure that carries only the reason a host reports. */
function unresolved(code: ComponentPolicyDiagnosticCode): TraceResult {
  return { resolved: false, code };
}

type ExpressionReference =
  | { readonly kind: "local"; readonly localName: string }
  | { readonly kind: "request"; readonly source: string; readonly exportName: string };

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
  const tracer = createTracer(adapter, options);

  for (const componentName of analysis.importedJsxNames) {
    const reference = importedReference(componentName, analysis.imports);
    if (!reference) continue;
    const result = await tracer.request(reference.source, reference.exportName, importer);
    if (result.resolved) {
      components[componentName] = result.protocol;
      continue;
    }
    diagnostics.push({
      code: result.code,
      componentName,
      source: reference.source,
      exportName: reference.exportName,
    });
  }

  return { components, diagnostics };
}

/** Depth-first pre-order traversal of every node in a tree. */
function visit(node: SyntaxNode, callback: (node: SyntaxNode) => void): void {
  callback(node);
  for (const child of childNodes(node)) visit(child, callback);
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
    const name = jsxMemberName(node.name);
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

/** Where one trace stands: what it has visited and how deep it has gone. */
interface TraceState {
  readonly visited: ReadonlySet<string>;
  readonly depth: number;
}

/** One parsed module participating in a trace. */
interface TracedModule {
  readonly analysis: ModuleAnalysis;
  /** Build-tool id used to resolve further requests from this module. */
  readonly moduleId: string;
  /** Stable source path recorded in resolved component ids. */
  readonly canonicalSource: string;
}

/**
 * Trace authored imports to the protocol of the component they name.
 *
 * The tracer closes over the host Adapter and the protocol catalog, so each
 * step carries only its request, the module it sits in, and its trace state.
 */
function createTracer(adapter: ComponentModuleAdapter, options: ResolveHostComponentPolicyOptions) {
  async function request(
    source: string,
    exportName: string,
    importer: string,
    state: TraceState,
  ): Promise<TraceResult> {
    const declared = declaredProtocol(source, exportName, options);
    if (declared) return resolvedProtocol(source, exportName, declared);
    if (state.depth >= MAX_REEXPORT_DEPTH) return unresolved("component-export-unresolved");

    let resolvedId: string | null;
    try {
      resolvedId = await adapter.resolve(source, importer);
    } catch {
      resolvedId = null;
    }
    if (!resolvedId) return unresolved("component-import-unresolved");
    if (!adapter.isProjectSource(resolvedId)) return unresolved("component-protocol-unknown");

    const canonicalSource = stripModuleExtension(adapter.sourcePath(resolvedId));
    const canonicalProtocol = declaredProtocol(canonicalSource, exportName, options);
    if (canonicalProtocol) return resolvedProtocol(canonicalSource, exportName, canonicalProtocol);

    const visitKey = `${resolvedId}\0${exportName}`;
    if (state.visited.has(visitKey)) return unresolved("component-export-unresolved");
    const moduleSource = await adapter.read(resolvedId);
    if (moduleSource === null) return unresolved("component-export-unresolved");
    const analysis = analyseModuleSource(moduleSource);
    if (!analysis) return unresolved("component-export-unresolved");

    return resolveExport(
      { analysis, moduleId: resolvedId, canonicalSource },
      exportName,
      { visited: new Set(state.visited).add(visitKey), depth: state.depth + 1 },
    );
  }

  async function resolveExport(
    module: TracedModule,
    exportName: string,
    state: TraceState,
  ): Promise<TraceResult> {
    const target = module.analysis.exports.get(exportName);
    if (target?.kind === "request") {
      return request(target.source, target.exportName, module.moduleId, state);
    }
    if (target?.kind === "definition") {
      return followReference(
        expressionReference(target.node, module.analysis.imports),
        module,
        exportName,
        state,
      );
    }
    if (target?.kind === "local") {
      return resolveLocal(module, target.localName, exportName, state);
    }

    const candidates: TraceResult[] = [];
    for (const source of module.analysis.exportAll) {
      const candidate = await request(source, exportName, module.moduleId, state);
      if (candidate.resolved) candidates.push(candidate);
    }
    if (candidates.length === 1) return candidates[0]!;
    return unresolved("component-export-unresolved");
  }

  async function resolveLocal(
    module: TracedModule,
    localName: string,
    exportedName: string,
    state: TraceState,
  ): Promise<TraceResult> {
    const imported = module.analysis.imports.get(localName);
    if (imported && !imported.namespace) {
      return request(imported.source, imported.exportName, module.moduleId, state);
    }

    const declaration = module.analysis.declarations.get(localName);
    if (!declaration) return unresolved("component-export-unresolved");
    if (declaration.type !== "VariableDeclarator") {
      return projectProtocol(module.canonicalSource, exportedName);
    }
    return followReference(
      expressionReference(declaration.init, module.analysis.imports),
      module,
      exportedName,
      state,
    );
  }

  function followReference(
    reference: ExpressionReference | null,
    module: TracedModule,
    exportedName: string,
    state: TraceState,
  ): Promise<TraceResult> | TraceResult {
    if (!reference) return projectProtocol(module.canonicalSource, exportedName);
    if (reference.kind === "local") {
      return resolveLocal(module, reference.localName, exportedName, state);
    }
    return request(reference.source, reference.exportName, module.moduleId, state);
  }

  return {
    /** Resolve one authored import to the protocol of the component it names. */
    request: (source: string, exportName: string, importer: string) =>
      request(source, exportName, importer, { visited: new Set(), depth: 0 }),
  };
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
