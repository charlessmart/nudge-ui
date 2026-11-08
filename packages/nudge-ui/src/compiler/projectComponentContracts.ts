import { readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import ts from "typescript";
import type {
  ComponentContract,
  ComponentPropContract,
  ComponentPropValue,
} from "./componentContractTypes.ts";
import { acceptsChildren, propContract, propsTypeFromComponent } from "./packageComponentContracts.ts";

export interface ProjectContractContext {
  root: string;
  /** Absolute component sources; they become the program's root names. */
  files: readonly string[];
  /** Reuses unchanged source files and the old type graph on a rebuild. */
  oldProgram?: ts.Program;
  /** Project-relative path recorded in contracts; defaults to the posix path relative to `root`. */
  catalogPath?: (file: string) => string;
}

export interface ProjectContractResult {
  contracts: ComponentContract[];
  program: ts.Program;
}

const FALLBACK_COMPILER_OPTIONS: ts.CompilerOptions = {
  allowJs: true,
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
};

/** Declarations from these files describe the DOM, not the project, so their props never become controls. */
const PLATFORM_DECLARATION = /[\\/]node_modules[\\/](?:@types[\\/](?:react|react-dom)|csstype|typescript[\\/]lib)[\\/]/;


const STRUCTURAL_TEXT_PROPS = new Set(["id", "className", "href", "src", "role", "style", "children", "ref", "key"]);

function readConfig(configPath: string): ts.ParsedCommandLine | null {
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error || !read.config) return null;
  return ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath), undefined, configPath);
}

function referencedConfigPath(reference: ts.ProjectReference): string {
  return ts.sys.fileExists(reference.path) ? reference.path : resolve(reference.path, "tsconfig.json");
}

/** Solution-style tsconfigs list no files; the referenced project that includes the components owns the options. */
export function loadProjectCompilerOptions(
  root: string,
  files: readonly string[],
): ts.CompilerOptions {
  let options: ts.CompilerOptions = {};
  let loaded = false;
  try {
    const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
    const parsed = configPath ? readConfig(configPath) : null;
    if (parsed) {
      options = parsed.options;
      loaded = true;
      if (parsed.projectReferences?.length) {
        const wanted = new Set(files.map((file) => resolve(file)));
        let best: { options: ts.CompilerOptions; matches: number } | null = null;
        for (const reference of parsed.projectReferences) {
          const child = readConfig(referencedConfigPath(reference));
          if (!child) continue;
          const matches = child.fileNames.filter((name) => wanted.has(resolve(name))).length;
          if (matches > (best?.matches ?? 0)) best = { options: child.options, matches };
        }
        if (best) options = best.options;
        else if (parsed.fileNames.length === 0) loaded = false;
      }
    }
  } catch {
    loaded = false;
  }
  const base = loaded ? options : { ...FALLBACK_COMPILER_OPTIONS, ...options };
  return {
    ...base,
    jsx: base.jsx ?? ts.JsxEmit.ReactJSX,
    moduleResolution: base.moduleResolution ?? ts.ModuleResolutionKind.Bundler,
    allowJs: base.allowJs ?? true,
    // Without a target TypeScript picks ES5 libs, where React's `Iterable` is missing and ReactNode degrades to any.
    ...(base.target === undefined && base.lib === undefined ? { target: ts.ScriptTarget.ES2022 } : {}),
    checkJs: false,
    // Forced: nothing is emitted, and optionality reads wrongly without strict null checks.
    noEmit: true,
    composite: false,
    incremental: false,
    declaration: false,
    declarationMap: false,
    emitDeclarationOnly: false,
    tsBuildInfoFile: undefined,
    skipLibCheck: true,
    strictNullChecks: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
  };
}

interface CachedSource {
  mtimeMs: number;
  size: number;
  languageVersion: number;
  file: ts.SourceFile;
}

/** Parsed files survive between runs, so a rebuild re-parses only what changed on disk. */
const sourceCache = new Map<string, CachedSource>();

function cachingHost(options: ts.CompilerOptions): ts.CompilerHost {
  const host = ts.createCompilerHost(options, true);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreate) => {
    const languageVersion = typeof languageVersionOrOptions === "number"
      ? languageVersionOrOptions
      : languageVersionOrOptions.languageVersion;
    let stat: { mtimeMs: number; size: number } | null = null;
    try {
      stat = statSync(fileName);
    } catch {
      stat = null;
    }
    const cached = sourceCache.get(fileName);
    if (stat && cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size
      && cached.languageVersion === languageVersion) return cached.file;
    const file = getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreate);
    if (file && stat) {
      sourceCache.set(fileName, { mtimeMs: stat.mtimeMs, size: stat.size, languageVersion, file });
    }
    return file;
  };
  host.readFile = (fileName) => {
    try {
      return readFileSync(fileName, "utf8");
    } catch {
      return undefined;
    }
  };
  return host;
}

function isPlatformDeclaration(declaration: ts.Declaration): boolean {
  return PLATFORM_DECLARATION.test(declaration.getSourceFile().fileName);
}

function projectDeclaredSymbols(propsType: ts.Type, checker: ts.TypeChecker): ts.Symbol[] {
  return checker.getPropertiesOfType(propsType).filter((symbol) => {
    const declarations = symbol.getDeclarations();
    // Mapped types over literal keys have no declaration; they are authored, not platform.
    return !declarations || declarations.length === 0
      || declarations.some((declaration) => !isPlatformDeclaration(declaration));
  });
}

function isReactNodeLike(type: ts.Type): boolean {
  if (type.aliasSymbol?.getName() === "ReactNode") return true;
  if (!type.isUnion()) return false;
  const names = type.types.map((member) => member.getSymbol()?.getName());
  return type.types.some((member) => (member.flags & ts.TypeFlags.String) !== 0)
    && (names.includes("ReactElement") || names.includes("ReactPortal"));
}

function textPropContract(symbol: ts.Symbol, checker: ts.TypeChecker, location: ts.Node): ComponentPropContract | null {
  const name = symbol.getName();
  if (STRUCTURAL_TEXT_PROPS.has(name) || name.startsWith("aria") || name.startsWith("data")) return null;
  if (!isReactNodeLike(checker.getTypeOfSymbolAtLocation(symbol, location))) return null;
  return { name, control: "text", options: [], optional: (symbol.flags & ts.SymbolFlags.Optional) !== 0 };
}

function propsOf(
  componentType: ts.Type,
  checker: ts.TypeChecker,
  declaration: ts.Node,
): ComponentPropContract[] | null {
  const propsType = propsTypeFromComponent(componentType, checker, declaration);
  if (!propsType || (propsType.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection | ts.TypeFlags.Union)) === 0) {
    return null;
  }
  const props = projectDeclaredSymbols(propsType, checker)
    .map((symbol) => propContract(symbol, checker, declaration) ?? textPropContract(symbol, checker, declaration))
    .filter((prop): prop is ComponentPropContract => prop !== null);
  if (acceptsChildren(propsType, checker, declaration)) {
    props.push({ name: "children", control: "text", options: [], optional: true });
  }
  return props.length > 0 ? props : null;
}

function componentFunction(node: ts.Node | undefined): ts.SignatureDeclaration | null {
  if (!node) return null;
  if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return node;
  if (ts.isVariableDeclaration(node)) return componentFunction(node.initializer);
  if (ts.isParenthesizedExpression(node)) return componentFunction(node.expression);
  if (ts.isCallExpression(node)) {
    const callee = node.expression.getText().split(".").at(-1);
    return callee === "memo" || callee === "forwardRef" ? componentFunction(node.arguments[0]) : null;
  }
  return null;
}

function literalDefault(node: ts.Expression): ComponentPropValue | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

/** Literal defaults of a destructured props parameter, which the syntactic parser misses when the props type is imported. */
function destructuredDefaults(declaration: ts.Node): Map<string, ComponentPropValue> {
  const defaults = new Map<string, ComponentPropValue>();
  const pattern = componentFunction(declaration)?.parameters[0]?.name;
  if (!pattern || !ts.isObjectBindingPattern(pattern)) return defaults;
  for (const element of pattern.elements) {
    const key = element.propertyName ?? element.name;
    const value = element.initializer ? literalDefault(element.initializer) : undefined;
    if (value !== undefined && (ts.isIdentifier(key) || ts.isStringLiteral(key))) defaults.set(key.text, value);
  }
  return defaults;
}

function stripModuleExtension(file: string): string {
  return file.replace(/\.(?:d\.)?[cm]?[jt]sx?$/, "");
}

function defaultCatalogPath(root: string, file: string): string {
  return relative(root, file).split("\\").join("/");
}

interface TopLevelComponent {
  name: string;
  symbol: ts.Symbol;
  declaration: ts.Node;
}

/** Same scope as the syntactic extractor: every capitalized top-level function or variable, exported or not. */
function topLevelComponents(source: ts.SourceFile, checker: ts.TypeChecker): TopLevelComponent[] {
  const found: TopLevelComponent[] = [];
  const add = (nameNode: ts.Identifier | undefined, declaration: ts.Node): void => {
    if (!nameNode || !/^[A-Z]/.test(nameNode.text)) return;
    const symbol = checker.getSymbolAtLocation(nameNode);
    if (symbol) found.push({ name: nameNode.text, symbol, declaration });
  };
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement)) add(statement.name, statement);
    else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) add(declaration.name, declaration);
      }
    }
  }
  return found;
}

export function extractProjectComponentContracts(context: ProjectContractContext): ProjectContractResult {
  const root = resolve(context.root);
  const files = context.files.map((file) => (isAbsolute(file) ? file : resolve(root, file)));
  const options = loadProjectCompilerOptions(root, files);
  const program = ts.createProgram({
    rootNames: files,
    options,
    host: cachingHost(options),
    oldProgram: context.oldProgram,
  });
  const live = new Set(program.getSourceFiles().map((source) => source.fileName));
  for (const key of sourceCache.keys()) if (!live.has(key)) sourceCache.delete(key);

  const checker = program.getTypeChecker();
  const catalogPath = context.catalogPath ?? ((file: string) => defaultCatalogPath(root, file));
  const contracts: ComponentContract[] = [];
  for (const file of files) {
    const source = program.getSourceFile(file);
    if (!source) continue;
    const catalogFile = catalogPath(file);
    for (const component of topLevelComponents(source, checker)) {
      try {
        const props = propsOf(
          checker.getTypeOfSymbolAtLocation(component.symbol, component.declaration),
          checker,
          component.declaration,
        );
        if (!props) continue;
        const defaults = destructuredDefaults(component.declaration);
        contracts.push({
          componentId: `${stripModuleExtension(catalogFile)}#${component.name}`,
          name: component.name,
          file: catalogFile,
          props: props.map((prop) => {
            const value = defaults.get(prop.name);
            return validDefault(prop, value) ? { ...prop, defaultValue: value } : prop;
          }),
          provenance: "typescript",
        });
      } catch {
        // one unresolvable component must not hide the rest of the file
      }
    }
  }
  return { contracts, program };
}

function validDefault(prop: ComponentPropContract, value: ComponentPropValue | undefined): value is ComponentPropValue {
  if (value === undefined) return false;
  if (prop.control === "boolean") return typeof value === "boolean";
  if (prop.control === "select") return prop.options.includes(value);
  return typeof value === "string";
}

/** Checker controls and options win; authored defaults and syntactic-only props are kept. */
export function mergeComponentContract(
  syntactic: ComponentContract | undefined,
  checked: ComponentContract | undefined,
): ComponentContract | undefined {
  if (!syntactic || !checked) return syntactic ?? checked;
  const checkedByName = new Map(checked.props.map((prop) => [prop.name, prop]));
  const syntacticByName = new Map(syntactic.props.map((prop) => [prop.name, prop]));
  const withDefault = (prop: ComponentPropContract): ComponentPropContract => {
    const authored = syntacticByName.get(prop.name)?.defaultValue;
    const { defaultValue: _checkerDefault, ...rest } = prop;
    return authored !== undefined && validDefault(prop, authored) ? { ...rest, defaultValue: authored } : rest;
  };
  const props: ComponentPropContract[] = [
    ...syntactic.props.map((prop) => withDefault(checkedByName.get(prop.name) ?? prop)),
    ...checked.props.filter((prop) => !syntacticByName.has(prop.name)).map(withDefault),
  ];
  return { ...syntactic, props, provenance: "typescript" };
}

/** Contracts keyed by componentId: the checker refines syntactic ones and may add components the parser cannot see. */
export function mergeComponentContracts(
  syntactic: readonly ComponentContract[],
  checked: ReadonlyMap<string, ComponentContract>,
  skipIds: ReadonlySet<string> = new Set(),
): ComponentContract[] {
  const seen = new Set<string>();
  const merged: ComponentContract[] = [];
  for (const contract of syntactic) {
    seen.add(contract.componentId);
    merged.push(skipIds.has(contract.componentId)
      ? contract
      : mergeComponentContract(contract, checked.get(contract.componentId)) ?? contract);
  }
  for (const [id, contract] of checked) {
    if (!seen.has(id) && !skipIds.has(id)) merged.push(contract);
  }
  return merged;
}
