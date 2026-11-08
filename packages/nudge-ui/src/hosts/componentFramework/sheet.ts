import type { ComponentContract } from "../../compiler/index.ts";
import type { ComponentFrameworkAdapter } from "./adapter.ts";

/** Bundler-neutral pieces of a component sheet (ADR-0045, ADR-0046); hosts decide how its modules are addressed and served. */

function normalizeRoot(root: string): string {
  return root.replace(/\\/g, "/").replace(/\/$/, "");
}

export function isSheetWrapperFile(framework: ComponentFrameworkAdapter, file: string, root: string): boolean {
  const normalizedRoot = normalizeRoot(root);
  const normalized = file.replace(/\\/g, "/");
  return framework.sheetWrapperFiles.some((name) => normalized === `${normalizedRoot}/${name}`);
}

/** What the setup prompt asks an agent to create when the project has none. */
export function suggestedSheetWrapperFile(framework: ComponentFrameworkAdapter): string {
  return framework.sheetWrapperFiles[0] ?? "nudge.sheet";
}

/** The project's wrapper file: the configured path, else the first conventional name that exists. */
export function findSheetWrapperFile(
  framework: ComponentFrameworkAdapter,
  root: string,
  configured: string | undefined,
  exists: (file: string) => boolean,
): string | null {
  const join = (name: string): string => `${normalizeRoot(root)}/${name.replace(/^\.\//, "")}`;
  if (configured) {
    const file = configured.startsWith("/") ? configured : join(configured);
    return exists(file) ? file : null;
  }
  for (const name of framework.sheetWrapperFiles) {
    if (exists(join(name))) return join(name);
  }
  return null;
}

export interface SheetDefinitionInput {
  contracts: readonly ComponentContract[];
  /** The specifier the host's bundler resolves to a contract's module. */
  componentSpecifier(contract: ComponentContract): string;
  /** Specifier of the wrapper module, or null when the project has none. */
  wrapperSpecifier: string | null;
  /** Project-relative path shown in the setup prompt: the existing wrapper, else where one would go. */
  wrapperPath: string;
}

/**
 * Property lines of the object every sheet runtime receives: `contracts`, lazy `loaders` and `sheetWrapper`.
 * Each line ends in a comma, so a host can splice them into an object literal of its own.
 */
export function serializeSheetDefinition(input: SheetDefinitionInput, indent = "  "): string[] {
  const loaders: string[] = [];
  const seen = new Set<string>();
  for (const contract of input.contracts) {
    if (seen.has(contract.componentId)) continue;
    seen.add(contract.componentId);
    loaders.push(
      `${indent}${indent}${JSON.stringify(contract.componentId)}: () => import(${JSON.stringify(input.componentSpecifier(contract))})`
        + `.then((m) => m[${JSON.stringify(contract.name)}] ?? m.default),`,
    );
  }
  return [
    `${indent}contracts: ${JSON.stringify(input.contracts)},`,
    `${indent}loaders: {`,
    ...loaders,
    `${indent}},`,
    // Imported on demand so a wrapper that fails to load is reported in the sheet instead of blanking it.
    `${indent}sheetWrapper: { file: ${JSON.stringify(input.wrapperPath)}, load: ${input.wrapperSpecifier
      ? `() => import(${JSON.stringify(input.wrapperSpecifier)}).then((m) => m.default ?? m.SheetWrapper ?? null)`
      : "null"} },`,
  ];
}
