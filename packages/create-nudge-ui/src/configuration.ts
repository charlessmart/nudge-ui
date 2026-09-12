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

interface ConfigExport {
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
    return configureAstroSource(source, sourceFile);
  }
  if (framework === "vite-react") {
    return configureViteSource(source, sourceFile);
  }
  return configureNextSource(source, sourceFile);
}

function configureViteSource(
  source: string,
  sourceFile: ts.SourceFile,
): string {
  const packageName = "@nudge-ui/vite-react";
  const importName = "withNudgeUi";
  const target = findConfigExport(sourceFile, "Vite");
  const bindings = target.commonJs
    ? requiredBindings(sourceFile, packageName, importName)
    : importedBindings(sourceFile, packageName, importName);
  const wrapperBinding = bindings[0] ?? unusedBindingName(sourceFile, importName);
  const callableBindings = new Set([...bindings, wrapperBinding]);
  const edits: TextEdit[] = [];

  if (!containsCall(target.expression, callableBindings)) {
    const start = target.expression.getStart(sourceFile);
    const end = target.expression.getEnd();
    edits.push({ start, end, text: `${wrapperBinding}(${source.slice(start, end)})` });
  }
  if (bindings.length === 0) {
    const statement = target.commonJs
      ? `const { ${importName}${wrapperBinding === importName ? "" : `: ${wrapperBinding}`} } = require("${packageName}");`
      : `import { ${importName}${wrapperBinding === importName ? "" : ` as ${wrapperBinding}`} } from "${packageName}";`;
    edits.push(importEdit(sourceFile, statement, target.commonJs));
  }
  return applyEdits(source, edits);
}

function configureAstroSource(source: string, sourceFile: ts.SourceFile): string {
  const target = findDefaultExport(sourceFile, "Astro");
  const bindings = importedBindings(sourceFile, "@nudge-ui/astro", "withNudgeUi");
  const wrapperBinding = bindings[0] ?? unusedBindingName(sourceFile, "withNudgeUi");
  const edits: TextEdit[] = [];
  if (!containsCall(target, new Set(bindings))) {
    const start = target.getStart(sourceFile);
    const end = target.getEnd();
    edits.push({ start, end, text: `${wrapperBinding}(${source.slice(start, end)})` });
  }
  if (bindings.length === 0) {
    const importedName = wrapperBinding === "withNudgeUi"
      ? "withNudgeUi"
      : `withNudgeUi as ${wrapperBinding}`;
    edits.push(importEdit(
      sourceFile,
      `import { ${importedName} } from "@nudge-ui/astro";`,
      false,
    ));
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

function findConfigExport(sourceFile: ts.SourceFile, frameworkName: string): ConfigExport {
  const exports: ConfigExport[] = [];
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
    throw new Error(
      `Could not update the ${frameworkName} configuration: expected exactly one default or module.exports assignment.`,
    );
  }
  return exports[0]!;
}

function findDefaultExport(
  sourceFile: ts.SourceFile,
  frameworkName: string,
): ts.Expression {
  const exports = sourceFile.statements
    .filter((statement): statement is ts.ExportAssignment =>
      ts.isExportAssignment(statement) && !statement.isExportEquals)
    .map((statement) => statement.expression);
  if (exports.length !== 1) {
    throw new Error(
      `Could not update the ${frameworkName} configuration: expected exactly one default export.`,
    );
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

function unusedBindingName(sourceFile: ts.SourceFile, preferred: string): string {
  const identifiers = new Set<string>();
  visit(sourceFile, (node) => {
    if (ts.isIdentifier(node)) identifiers.add(node.text);
  });
  if (!identifiers.has(preferred)) return preferred;
  let suffix = 2;
  while (identifiers.has(`${preferred}${suffix}`)) suffix += 1;
  return `${preferred}${suffix}`;
}

function visit(root: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(root);
  ts.forEachChild(root, (child) => visit(child, visitor));
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
