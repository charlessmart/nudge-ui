import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import type { ConfigurationChange, Framework } from "./types.ts";

const nextConfigNames = ["next.config.ts", "next.config.mts", "next.config.mjs", "next.config.js", "next.config.cjs"];
const astroConfigNames = ["astro.config.ts", "astro.config.mts", "astro.config.mjs", "astro.config.js"];
const viteConfigNames = ["vite.config.ts", "vite.config.mts", "vite.config.mjs", "vite.config.js"];

interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface NextExport {
  readonly expression: ts.Expression;
  readonly commonJs: boolean;
}

/** Plans an idempotent host-configuration edit without writing to the project. */
export function planConfiguration(projectRoot: string, framework: Framework): ConfigurationChange | undefined {
  if (framework === "standalone") return undefined;
  const existingName = configurationNames(framework).find((name) => existsSync(join(projectRoot, name)));
  const name = existingName ?? defaultConfigName(framework);
  const path = join(projectRoot, name);
  const originalContent = existingName ? readFileSync(path, "utf8") : undefined;
  const original = originalContent ?? defaultConfiguration(framework);
  const content = configureSource(original, framework, name);
  if (content === original) return undefined;
  return { path, content, created: !existingName, originalContent };
}

/** Adds the selected adapter to a conventional host configuration source. */
export function configureSource(source: string, framework: Exclude<Framework, "standalone">, fileName: string): string {
  const sourceFile = parseSource(source, fileName);
  if (framework === "astro") {
    return configureArrayHost(source, sourceFile, "@nudge-ui/astro", "nudgeUiAstro", "integrations", "nudgeUiAstro()");
  }
  if (framework === "vite-react") {
    return configureArrayHost(source, sourceFile, "@nudge-ui/vite-react", "nudgeUi", "plugins", "...nudgeUi()");
  }
  return configureNextSource(source, sourceFile);
}

function configureArrayHost(
  source: string,
  sourceFile: ts.SourceFile,
  packageName: "@nudge-ui/astro" | "@nudge-ui/vite-react",
  importName: "nudgeUiAstro" | "nudgeUi",
  propertyName: "integrations" | "plugins",
  expression: string,
): string {
  const bindings = importedBindings(sourceFile, packageName, importName);
  const callableBindings = new Set([...bindings, importName]);
  const configObject = findDefineConfigObject(sourceFile, propertyName);
  const matchingProperties = configObject.properties.filter((property) => propertyText(property.name) === propertyName);
  if (matchingProperties.length > 1) {
    throw new Error(`Could not update ${propertyName}: the configuration contains duplicate ${propertyName} properties.`);
  }

  const property = matchingProperties[0];
  let configurationEdit: TextEdit | undefined;
  if (property) {
    if (!ts.isPropertyAssignment(property) || !ts.isArrayLiteralExpression(property.initializer)) {
      throw new Error(`Could not update ${propertyName}: expected ${propertyName} to be an array.`);
    }
    if (!containsCall(property.initializer, callableBindings)) {
      configurationEdit = insertArrayElement(source, sourceFile, property, expression);
    }
  } else {
    configurationEdit = insertObjectProperty(source, sourceFile, configObject, propertyName, expression);
  }

  const edits: TextEdit[] = configurationEdit ? [configurationEdit] : [];
  if (bindings.length === 0) {
    edits.push(importEdit(sourceFile, `import { ${importName} } from "${packageName}";`, false));
  }
  return applyEdits(source, edits);
}

function configureNextSource(source: string, sourceFile: ts.SourceFile): string {
  const target = findNextExport(sourceFile);
  const bindings = target.commonJs
    ? requiredBindings(sourceFile, "@nudge-ui/nextjs", "withNudgeUi")
    : importedBindings(sourceFile, "@nudge-ui/nextjs", "withNudgeUi");
  const callableBindings = new Set([...bindings, "withNudgeUi"]);
  const edits: TextEdit[] = [];

  if (!containsCall(target.expression, callableBindings)) {
    const start = target.expression.getStart(sourceFile);
    const end = target.expression.getEnd();
    edits.push({ start, end, text: `withNudgeUi(${source.slice(start, end)})` });
  }
  if (bindings.length === 0) {
    const statement = target.commonJs
      ? 'const { withNudgeUi } = require("@nudge-ui/nextjs");'
      : 'import { withNudgeUi } from "@nudge-ui/nextjs";';
    edits.push(importEdit(sourceFile, statement, target.commonJs));
  }
  return applyEdits(source, edits);
}

function parseSource(source: string, fileName: string): ts.SourceFile {
  const scriptKind = fileName.endsWith(".ts") || fileName.endsWith(".mts")
    ? ts.ScriptKind.TS
    : ts.ScriptKind.JS;
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
}

function findDefineConfigObject(sourceFile: ts.SourceFile, propertyName: string): ts.ObjectLiteralExpression {
  const candidates: ts.ObjectLiteralExpression[] = [];
  visit(sourceFile, (node) => {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "defineConfig"
      && node.arguments[0]
      && ts.isObjectLiteralExpression(node.arguments[0])
    ) candidates.push(node.arguments[0]);
  });
  if (candidates.length !== 1) {
    throw new Error(`Could not update ${propertyName}: expected exactly one defineConfig({ ... }) call.`);
  }
  return candidates[0]!;
}

function findNextExport(sourceFile: ts.SourceFile): NextExport {
  const exports: NextExport[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      exports.push({ expression: statement.expression, commonJs: false });
      continue;
    }
    if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)) continue;
    const assignment = statement.expression;
    if (assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken || !isModuleExports(assignment.left)) continue;
    exports.push({ expression: assignment.right, commonJs: true });
  }
  if (exports.length !== 1) {
    throw new Error("Could not update the Next.js configuration: expected exactly one default or module.exports assignment.");
  }
  return exports[0]!;
}

function isModuleExports(expression: ts.Expression): boolean {
  return ts.isPropertyAccessExpression(expression)
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === "module"
    && expression.name.text === "exports";
}

function importedBindings(sourceFile: ts.SourceFile, packageName: string, importName: string): string[] {
  const bindings: string[] = [];
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== packageName
      || !statement.importClause?.namedBindings
      || !ts.isNamedImports(statement.importClause.namedBindings)
    ) continue;
    for (const element of statement.importClause.namedBindings.elements) {
      if ((element.propertyName?.text ?? element.name.text) === importName) bindings.push(element.name.text);
    }
  }
  return bindings;
}

function requiredBindings(sourceFile: ts.SourceFile, packageName: string, importName: string): string[] {
  const bindings: string[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer || !isRequireCall(declaration.initializer, packageName)) continue;
      if (!ts.isObjectBindingPattern(declaration.name)) continue;
      for (const element of declaration.name.elements) {
        const importedName = element.propertyName && ts.isIdentifier(element.propertyName)
          ? element.propertyName.text
          : element.name.getText(sourceFile);
        if (importedName === importName && ts.isIdentifier(element.name)) bindings.push(element.name.text);
      }
    }
  }
  return bindings;
}

function isRequireCall(expression: ts.Expression, packageName: string): boolean {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 1) return false;
  const argument = expression.arguments[0];
  if (!argument) return false;
  return ts.isCallExpression(expression)
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === "require"
    && ts.isStringLiteral(argument)
    && argument.text === packageName;
}

function containsCall(root: ts.Node, bindingNames: ReadonlySet<string>): boolean {
  let found = false;
  visit(root, (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && bindingNames.has(node.expression.text)) {
      found = true;
    }
  });
  return found;
}

function visit(root: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(root);
  ts.forEachChild(root, (child) => visit(child, visitor));
}

function propertyText(name: ts.PropertyName | undefined): string | undefined {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) return name.expression.text;
  return undefined;
}

function insertArrayElement(
  source: string,
  sourceFile: ts.SourceFile,
  property: ts.PropertyAssignment,
  expression: string,
): TextEdit {
  const array = property.initializer;
  if (!ts.isArrayLiteralExpression(array)) throw new Error("Expected an array property.");
  const start = array.getStart(sourceFile) + 1;
  const end = array.getEnd() - 1;
  const indentation = lineIndentation(source, property.getStart(sourceFile));
  const elementIndentation = `${indentation}  `;
  const interior = source.slice(start, end);
  if (interior.trim() === "") {
    return { start, end, text: `\n${elementIndentation}${expression},\n${indentation}` };
  }
  const text = interior.startsWith("\n")
    ? `\n${elementIndentation}${expression},`
    : `\n${elementIndentation}${expression},\n${elementIndentation}`;
  return { start, end: start, text };
}

function insertObjectProperty(
  source: string,
  sourceFile: ts.SourceFile,
  object: ts.ObjectLiteralExpression,
  propertyName: string,
  expression: string,
): TextEdit {
  const start = object.getStart(sourceFile) + 1;
  const indentation = lineIndentation(source, object.getStart(sourceFile));
  const propertyIndentation = `${indentation}  `;
  const empty = object.properties.length === 0;
  const text = empty
    ? `\n${propertyIndentation}${propertyName}: [${expression}],\n${indentation}`
    : `\n${propertyIndentation}${propertyName}: [${expression}],`;
  return { start, end: start, text };
}

function importEdit(sourceFile: ts.SourceFile, statement: string, commonJs: boolean): TextEdit {
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const lastImport = imports.at(-1);
  if (!commonJs && lastImport) return { start: lastImport.end, end: lastImport.end, text: `\n${statement}` };

  if (commonJs) {
    const directives = sourceFile.statements.filter((candidate) =>
      ts.isExpressionStatement(candidate) && ts.isStringLiteral(candidate.expression));
    const lastDirective = directives.at(-1);
    if (lastDirective) return { start: lastDirective.end, end: lastDirective.end, text: `\n${statement}` };
  }

  const firstStatement = sourceFile.statements[0];
  const start = firstStatement?.getStart(sourceFile) ?? sourceFile.getEnd();
  return { start, end: start, text: `${statement}\n` };
}

function lineIndentation(source: string, position: number): string {
  const lineStart = source.lastIndexOf("\n", position - 1) + 1;
  const match = /^[ \t]*/.exec(source.slice(lineStart, position));
  return match?.[0] ?? "";
}

function applyEdits(source: string, edits: readonly TextEdit[]): string {
  return [...edits]
    .sort((left, right) => right.start - left.start)
    .reduce((result, edit) => `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`, source);
}

function configurationNames(framework: Exclude<Framework, "standalone">): readonly string[] {
  if (framework === "nextjs") return nextConfigNames;
  if (framework === "astro") return astroConfigNames;
  return viteConfigNames;
}

function defaultConfigName(framework: Exclude<Framework, "standalone">): string {
  if (framework === "nextjs") return "next.config.mjs";
  if (framework === "astro") return "astro.config.mjs";
  return "vite.config.mjs";
}

function defaultConfiguration(framework: Exclude<Framework, "standalone">): string {
  if (framework === "nextjs") return "const nextConfig = {};\n\nexport default nextConfig;\n";
  if (framework === "astro") {
    return 'import { defineConfig } from "astro/config";\n\nexport default defineConfig({});\n';
  }
  return 'import { defineConfig } from "vite";\n\nexport default defineConfig({});\n';
}
