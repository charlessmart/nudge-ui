import type {
  TokenCatalogDiagnostic,
  TokenDeclaration,
  TokenDefinition,
} from "@design-tool/css/model";
import type { DesignToolRuntimeConfig } from "@design-tool/inspector";

/** Evidence collected from the browser's current stylesheet order. */
export interface StandaloneStylesheetOrderEvidence {
  readonly projectPaths: readonly string[];
  /** False when a sheet is cross-origin, inline, unloaded, or duplicated. */
  readonly complete: boolean;
}

/** Reads same-origin stylesheet order without making directory order authoritative. */
export function collectStandaloneStylesheetOrder(
  document: Document,
): StandaloneStylesheetOrderEvidence {
  const projectPaths: string[] = [];
  let complete = true;

  for (let index = 0; index < document.styleSheets.length; index += 1) {
    const sheet = document.styleSheets.item(index) as CSSStyleSheet | null;
    if (!sheet) continue;
    try {
      // Accessing cssRules is the loaded/accessibility check. Cross-origin and
      // still-loading sheets throw and must not be treated as ordered evidence.
      void sheet.cssRules;
    } catch {
      complete = false;
      continue;
    }
    const projectPath = stylesheetProjectPath(sheet.href, document);
    if (!projectPath || projectPaths.includes(projectPath)) {
      complete = false;
      continue;
    }
    projectPaths.push(projectPath);
  }

  return { projectPaths, complete };
}

/** The catalog plus diagnostics produced by one reconciliation pass. */
export interface StandaloneTokenCatalogReconciliation {
  /** Definitions whose declaration order is honest given the evidence. */
  readonly catalog: readonly TokenDefinition[];
  /** Explanations for definitions left in discovery order. */
  readonly diagnostics: readonly TokenCatalogDiagnostic[];
}

/**
 * Reorders declarations using CSSOM stylesheet order when that evidence is
 * complete.
 *
 * A duplicate definition with incomplete order evidence keeps its discovery
 * order — directory order is honest inventory evidence — instead of hiding
 * the duplicate entirely, and the unresolved ordering is reported as a
 * diagnostic so consumers know the winner was not proven from the browser.
 */
export function reconcileStandaloneTokenCatalog(
  catalog: readonly TokenDefinition[],
  evidence: StandaloneStylesheetOrderEvidence,
): StandaloneTokenCatalogReconciliation {
  const ranks = new Map(evidence.projectPaths.map((path, index) => [path, index]));
  const stride = Math.max(1, ...catalog.map((definition) => definition.declarations.length)) + 1;
  const diagnostics: TokenCatalogDiagnostic[] = [];

  const resolved = catalog.map((definition) => {
    if (definition.declarations.length < 2) return definition;
    const declarations = definition.declarations.map((declaration, index) => ({
      declaration,
      index,
      path: sourcePath(declaration),
      rank: ranks.get(sourcePath(declaration)),
    }));
    if (!evidence.complete || declarations.some((entry) => entry.rank === undefined)) {
      // Incomplete browser order never picks a winner; keep discovery order
      // (already present on each declaration) and say so.
      diagnostics.push({
        code: "token-order-unresolved",
        message: `Kept ${definition.declarations.length} declarations of "${declarationName(definition)}" in discovery order because browser stylesheet order evidence was incomplete.`,
        module: declarations.find((entry) => entry.rank === undefined)?.path || "standalone-css",
      });
      return definition;
    }

    declarations.sort((left, right) =>
      left.rank! - right.rank! || left.index - right.index);
    return {
      ...definition,
      declarations: declarations.map(({ declaration, rank }, index): TokenDeclaration => ({
        ...declaration,
        order: rank! * stride + index,
      })),
    };
  });

  const changed = resolved.some((definition, index) => definition !== catalog[index]);
  return {
    catalog: changed ? resolved : catalog,
    diagnostics,
  };
}

/** Applies the standalone host's browser stylesheet evidence before bootstrap. */
export function reconcileStandaloneRuntime(
  runtime: DesignToolRuntimeConfig,
  document: Document,
): DesignToolRuntimeConfig {
  const { catalog: tokenCatalog, diagnostics } = reconcileStandaloneTokenCatalog(
    runtime.tokenCatalog,
    collectStandaloneStylesheetOrder(document),
  );
  const tokenDiagnostics = diagnostics.length === 0
    ? runtime.tokenDiagnostics
    : [...runtime.tokenDiagnostics, ...diagnostics];
  return tokenCatalog === runtime.tokenCatalog && tokenDiagnostics === runtime.tokenDiagnostics
    ? runtime
    : { ...runtime, tokenCatalog, tokenDiagnostics };
}

function sourcePath(declaration: TokenDeclaration): string {
  const match = declaration.source.match(/^(.*):\d+$/);
  return match?.[1] ?? "";
}

function declarationName(definition: TokenDefinition): string {
  return definition.cssName || definition.name;
}

function stylesheetProjectPath(href: string | null, document: Document): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, document.baseURI);
    const origin = document.defaultView?.location.origin;
    if (origin && url.origin !== origin) return null;
    return decodeURIComponent(url.pathname).replace(/^\/+/, "");
  } catch {
    return null;
  }
}
