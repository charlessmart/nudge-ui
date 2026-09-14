import { dirname, relative, resolve } from "node:path";
import ts from "typescript";
import type {
  ComponentContract,
  ComponentPropContract,
  ComponentPropValue,
} from "./componentContractTypes.ts";

/**
 * Identifies a package import from the host module that uses it.
 *
 * The host path is intentional: TypeScript uses it as the resolution anchor,
 * so the same module specifier can resolve to a different installed package in
 * each application. The returned contract identity always uses the import
 * specifier, never an absolute node_modules path.
 */
export interface PackageContractContext {
  hostFile: string;
  moduleSpecifier: string;
  compilerOptions?: ts.CompilerOptions;
}

export interface PackageContractCatalogContext {
  hostFile: string;
  moduleSpecifiers: readonly string[];
  compilerOptions?: ts.CompilerOptions;
}

function isBareModuleSpecifier(value: string): boolean {
  return value !== ""
    && !value.startsWith(".")
    && !value.startsWith("/")
    && !value.startsWith("\0")
    && !value.startsWith("virtual:");
}

function rootJsxIdentifier(tagName: ts.JsxTagNameExpression): string | null {
  let current: ts.JsxTagNameExpression = tagName;
  while (ts.isPropertyAccessExpression(current)) current = current.expression;
  return ts.isIdentifier(current) ? current.text : null;
}

/** Returns bare modules whose imported bindings are rendered as JSX. */
export function collectPackageComponentModules(code: string, fileName: string): string[] {
  const source = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.JSX,
  );
  const modulesByBinding = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || !isBareModuleSpecifier(statement.moduleSpecifier.text)) continue;
    const moduleSpecifier = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (clause?.name) modulesByBinding.set(clause.name.text, moduleSpecifier);
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      modulesByBinding.set(bindings.name.text, moduleSpecifier);
    } else if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (!element.isTypeOnly) modulesByBinding.set(element.name.text, moduleSpecifier);
      }
    }
  }

  const modules = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const binding = rootJsxIdentifier(node.tagName);
      const moduleSpecifier = binding ? modulesByBinding.get(binding) : undefined;
      if (moduleSpecifier) modules.add(moduleSpecifier);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...modules].sort();
}

const DEFAULT_COMPILER_OPTIONS: ts.CompilerOptions = {
  allowJs: false,
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  skipLibCheck: true,
  strictNullChecks: true,
  target: ts.ScriptTarget.ES2022,
};

const STRUCTURAL_PROP_NAMES = new Set([
  "children",
  "className",
  "href",
  "id",
  "ref",
  "role",
  "src",
  "style",
]);

function symbolName(symbol: ts.Symbol | undefined): string | null {
  if (!symbol) return null;
  return symbol.getName();
}

function typeName(type: ts.Type): string | null {
  return symbolName(type.aliasSymbol) ?? symbolName(type.getSymbol());
}

function typeArguments(checker: ts.TypeChecker, type: ts.Type): readonly ts.Type[] {
  if (!(type.flags & ts.TypeFlags.Object)) return [];
  return checker.getTypeArguments(type as ts.TypeReference);
}

function isNamedType(type: ts.Type, name: string): boolean {
  return typeName(type) === name;
}

function isUndefined(type: ts.Type): boolean {
  return (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0;
}

function definedTypes(type: ts.Type): readonly ts.Type[] {
  return (type.isUnion() ? type.types : [type]).filter((member) => !isUndefined(member));
}

function literalValue(type: ts.Type): ComponentPropValue | null {
  if (type.flags & ts.TypeFlags.StringLiteral) return (type as ts.StringLiteralType).value;
  if (type.flags & ts.TypeFlags.NumberLiteral) return (type as ts.NumberLiteralType).value;
  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    return (type as unknown as { intrinsicName?: string }).intrinsicName === "true";
  }
  return null;
}

function conditionalObjectMatches(
  type: ts.Type,
  checker: ts.TypeChecker,
  location: ts.Node,
  accepts: (member: ts.Type) => boolean,
): boolean {
  if (!(type.flags & ts.TypeFlags.Object)) return false;
  if (checker.getIndexTypeOfType(type, ts.IndexKind.String)
    || checker.getIndexTypeOfType(type, ts.IndexKind.Number)) return false;
  const properties = checker.getPropertiesOfType(type);
  if (properties.length === 0) return false;
  return properties.every((property) => {
    const propertyType = checker.getTypeOfSymbolAtLocation(property, location);
    const propertyMembers = definedTypes(propertyType);
    return propertyMembers.length > 0 && propertyMembers.every(accepts);
  });
}

function literalOptions(
  members: readonly ts.Type[],
  checker: ts.TypeChecker,
  location: ts.Node,
): ComponentPropValue[] | null {
  const values = members
    .map(literalValue)
    .filter((value): value is ComponentPropValue => value !== null);
  // A public prop can accept a finite scalar vocabulary as well as a
  // responsive/conditional object. The Inspector only offers this select when
  // the current runtime value is scalar, so retain valid scalar alternatives
  // without pretending the object form is itself editable here.
  if (values.length < 2) return null;
  const primitive = typeof values[0];
  if (!values.every((value) => typeof value === primitive)) return null;
  const allowed = new Set(values.map((value) => `${typeof value}:${String(value)}`));
  if (!members.every((member) => {
    const value = literalValue(member);
    if (value !== null) return allowed.has(`${typeof value}:${String(value)}`);
    return conditionalObjectMatches(member, checker, location, (propertyMember) => {
      const propertyValue = literalValue(propertyMember);
      return propertyValue !== null
        && allowed.has(`${typeof propertyValue}:${String(propertyValue)}`);
    });
  })) return null;
  return values;
}

function isBooleanType(
  members: readonly ts.Type[],
  checker: ts.TypeChecker,
  location: ts.Node,
): boolean {
  const scalarMembers = members.filter((member) => (
    member.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)
  ) !== 0);
  if (scalarMembers.length === 0) return false;
  if (!members.every((member) => scalarMembers.includes(member)
    || conditionalObjectMatches(member, checker, location, (propertyMember) => (
      propertyMember.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)
    ) !== 0))) return false;
  if (scalarMembers.some((member) => (member.flags & ts.TypeFlags.Boolean) !== 0)) return true;
  const values = new Set(scalarMembers.map(literalValue));
  return values.has(false) && values.has(true);
}

function propContract(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  location: ts.Node,
): ComponentPropContract | null {
  const name = symbol.getName();
  if (!name || STRUCTURAL_PROP_NAMES.has(name) || name.startsWith("aria") || name.startsWith("data")) {
    return null;
  }

  const types = definedTypes(checker.getTypeOfSymbolAtLocation(symbol, location));
  if (isBooleanType(types, checker, location)) {
    return {
      name,
      control: "boolean",
      options: [false, true],
      optional: (symbol.flags & ts.SymbolFlags.Optional) !== 0,
    };
  }
  const options = literalOptions(types, checker, location);
  if (options) {
    return {
      name,
      control: "select",
      options,
      optional: (symbol.flags & ts.SymbolFlags.Optional) !== 0,
    };
  }
  if (types.length === 1 && (types[0]!.flags & ts.TypeFlags.String)) {
    return {
      name,
      control: "text",
      options: [],
      optional: (symbol.flags & ts.SymbolFlags.Optional) !== 0,
    };
  }
  return null;
}

function packageName(moduleSpecifier: string): string {
  const parts = moduleSpecifier.split("/");
  return moduleSpecifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : parts[0] ?? moduleSpecifier;
}

function packageRootFor(resolvedModule: string, moduleSpecifier: string): string {
  const normalized = resolvedModule.replaceAll("\\", "/");
  const marker = `/node_modules/${packageName(moduleSpecifier)}/`;
  const markerStart = normalized.lastIndexOf(marker);
  if (markerStart >= 0) return normalized.slice(0, markerStart + marker.length - 1);
  return dirname(resolvedModule);
}

function isInside(root: string, fileName: string): boolean {
  const relativeFile = relative(resolve(root), resolve(fileName));
  return relativeFile === ""
    || (relativeFile !== ".." && !relativeFile.startsWith(".." + "/") && !relativeFile.startsWith(".." + "\\"));
}

function packageDeclaredSymbols(
  propsType: ts.Type,
  checker: ts.TypeChecker,
  packageRoot: string,
): ts.Symbol[] {
  return checker.getPropertiesOfType(propsType).filter((symbol) =>
    symbol.getDeclarations()?.some((declaration) =>
      isInside(packageRoot, declaration.getSourceFile().fileName)) ?? false,
  );
}

function propsTypeFromComponent(
  componentType: ts.Type,
  checker: ts.TypeChecker,
  location: ts.Node,
): ts.Type | null {
  if (isNamedType(componentType, "ForwardRefExoticComponent")) {
    return typeArguments(checker, componentType)[0] ?? null;
  }
  const signature = componentType.getCallSignatures()
    .find((candidate) => candidate.parameters.length > 0);
  const props = signature?.parameters[0];
  if (props) return checker.getTypeOfSymbolAtLocation(props, location);
  return null;
}

function componentContract(
  exportName: string,
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  packageRoot: string,
  moduleSpecifier: string,
): ComponentContract | null {
  if (exportName !== "default" && !/^[A-Z]/.test(exportName)) return null;
  const target = symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
  const declaration = target.valueDeclaration ?? target.declarations?.[0];
  if (!declaration) return null;
  const componentType = checker.getTypeOfSymbolAtLocation(target, declaration);
  const propsType = propsTypeFromComponent(componentType, checker, declaration);
  if (!propsType) return null;
  const props = packageDeclaredSymbols(propsType, checker, packageRoot)
    .map((prop) => propContract(prop, checker, declaration))
    .filter((prop): prop is ComponentPropContract => prop !== null);
  if (props.length === 0) return null;
  return {
    componentId: `${moduleSpecifier}#${exportName}`,
    name: exportName,
    file: moduleSpecifier,
    props,
    provenance: "typescript",
  };
}

/**
 * Extracts scalar controls from component exports in an installed package.
 *
 * It follows TypeScript's resolved module graph, including barrel re-exports
 * and declaration-file aliases, rather than trying to parse one declaration
 * file in isolation.
 */
export function extractPackageComponentContracts(
  context: PackageContractContext,
): ComponentContract[] {
  return extractPackageComponentContractCatalog({
    hostFile: context.hostFile,
    moduleSpecifiers: [context.moduleSpecifier],
    compilerOptions: context.compilerOptions,
  });
}

/** Extracts several package modules through one declaration-only program. */
export function extractPackageComponentContractCatalog(
  context: PackageContractCatalogContext,
): ComponentContract[] {
  const compilerOptions = { ...DEFAULT_COMPILER_OPTIONS, ...context.compilerOptions };
  const moduleSpecifiers = [...new Set(context.moduleSpecifiers)].sort();
  if (moduleSpecifiers.length === 0) return [];
  const virtualFile = resolve(dirname(context.hostFile), "__nudge_ui_package_contracts__.tsx");
  const virtualSource = moduleSpecifiers
    .map((moduleSpecifier, index) =>
      `import * as __nudgeUiPackage${index} from ${JSON.stringify(moduleSpecifier)};`)
    .join("\n");
  const host = ts.createCompilerHost(compilerOptions);
  const getSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (fileName) => fileName === virtualFile || ts.sys.fileExists(fileName);
  host.readFile = (fileName) => fileName === virtualFile ? virtualSource : ts.sys.readFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
    fileName === virtualFile
      ? ts.createSourceFile(fileName, virtualSource, languageVersion, true, ts.ScriptKind.TSX)
      : getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram({
    rootNames: [virtualFile],
    options: compilerOptions,
    host,
  });
  const checker = program.getTypeChecker();
  return moduleSpecifiers.flatMap((moduleSpecifier) => {
    const resolution = ts.resolveModuleName(
      moduleSpecifier,
      virtualFile,
      compilerOptions,
      host,
    ).resolvedModule;
    if (!resolution) return [];
    const sourceFile = program.getSourceFile(resolution.resolvedFileName);
    if (!sourceFile) return [];
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) return [];

    const packageRoot = packageRootFor(resolution.resolvedFileName, moduleSpecifier);
    return checker.getExportsOfModule(moduleSymbol)
      .map((symbol) => {
        const exportName = symbolName(symbol);
        return exportName
          ? componentContract(exportName, symbol, checker, packageRoot, moduleSpecifier)
          : null;
      })
      .filter((contract): contract is ComponentContract => contract !== null);
  });
}
