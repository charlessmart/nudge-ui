import type {
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

/** Reorders declarations using CSSOM stylesheet order when that evidence is complete. */
export function reconcileStandaloneTokenCatalog(
  catalog: readonly TokenDefinition[],
  evidence: StandaloneStylesheetOrderEvidence,
): readonly TokenDefinition[] {
  const ranks = new Map(evidence.projectPaths.map((path, index) => [path, index]));
  const stride = Math.max(1, ...catalog.map((definition) => definition.declarations.length)) + 1;

  return catalog.map((definition) => {
    if (definition.declarations.length < 2) return definition;
    const declarations = definition.declarations.map((declaration, index) => ({
      declaration,
      index,
      path: sourcePath(declaration),
      rank: ranks.get(sourcePath(declaration)),
    }));
    if (!evidence.complete || declarations.some((entry) => entry.rank === undefined)) {
      // A duplicate with incomplete order evidence has no honest winner.
      return { ...definition, declarations: [] };
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
}

/** Applies the standalone host's browser stylesheet evidence before bootstrap. */
export function reconcileStandaloneRuntime(
  runtime: DesignToolRuntimeConfig,
  document: Document,
): DesignToolRuntimeConfig {
  const tokenCatalog = reconcileStandaloneTokenCatalog(
    runtime.tokenCatalog,
    collectStandaloneStylesheetOrder(document),
  );
  return tokenCatalog === runtime.tokenCatalog
    ? runtime
    : { ...runtime, tokenCatalog };
}

function sourcePath(declaration: TokenDeclaration): string {
  const match = declaration.source.match(/^(.*):\d+$/);
  return match?.[1] ?? "";
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
