import type {
  TokenCatalogDiagnostic,
  TokenDeclaration,
  TokenDefinition,
} from "@nudge-ui/css/model";
import type { NudgeUiRuntimeConfig } from "./runtimeConfig.ts";

/** Evidence collected from the browser's current stylesheet order. */
export interface DocumentStylesheetOrderEvidence {
  readonly projectPaths: readonly string[];
  /** False when a sheet is cross-origin, inline, unloaded, or duplicated. */
  readonly complete: boolean;
}

/** Reads same-origin stylesheet order without making directory order authoritative. */
export function collectDocumentStylesheetOrder(
  document: Document,
): DocumentStylesheetOrderEvidence {
  const projectPaths: string[] = [];
  let complete = true;
  for (let index = 0; index < document.styleSheets.length; index += 1) {
    // SAFETY: CSSStyleSheetList.item() returns a CSSStyleSheet or null.
    const sheet = document.styleSheets.item(index) as CSSStyleSheet | null;
    if (!sheet) continue;
    try {
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

/** Token catalog plus diagnostics produced by document-order reconciliation. */
export interface DocumentTokenCatalogReconciliation {
  readonly catalog: readonly TokenDefinition[];
  readonly diagnostics: readonly TokenCatalogDiagnostic[];
}

/** Reorders duplicate declarations only when browser order evidence is complete. */
export function reconcileDocumentTokenCatalog(
  catalog: readonly TokenDefinition[],
  evidence: DocumentStylesheetOrderEvidence,
): DocumentTokenCatalogReconciliation {
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
      diagnostics.push({
        code: "token-order-unresolved",
        message: `Kept ${definition.declarations.length} declarations of "${declarationName(definition)}" in discovery order because browser stylesheet order evidence was incomplete.`,
        module: declarations.find((entry) => entry.rank === undefined)?.path || "document-css",
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
  return { catalog: changed ? resolved : catalog, diagnostics };
}

/** Applies browser stylesheet evidence to a host runtime before bootstrap. */
export function reconcileRuntimeWithDocumentStylesheets(
  runtime: NudgeUiRuntimeConfig,
  document: Document,
): NudgeUiRuntimeConfig {
  const { catalog: tokenCatalog, diagnostics } = reconcileDocumentTokenCatalog(
    runtime.tokenCatalog,
    collectDocumentStylesheetOrder(document),
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
