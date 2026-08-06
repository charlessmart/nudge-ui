import type { TokenDefinition, TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty, TokenTable } from "@design-tool/css/model";
import type { InteractionState } from "../styleState.ts";
import {
  buildTokenTable,
  getAvailableInteractionStates,
  getAvailableTokenCatalog,
  getAvailableTokenEntriesForElement,
  getResolvedProperties,
  getResolvedPropertiesForState,
  getResolvedPropertiesStable,
  invalidateStyleResolutionCache,
} from "../tokens/resolution.ts";
import { buildTokenCatalogRows, type TokenCatalogRow } from "../tokens/catalog.ts";
import {
  documentRevisions,
  registerResolutionElement,
  subscribeDocumentRevision,
  type DocumentRevisions,
} from "../tokens/resolution/cssomCollector.ts";

export interface BrowserTokenKnowledge {
  /** Build-time definitions normalized by a build-tool Adapter. */
  definitions: readonly TokenDefinition[];
  /** Optional compiler entries used to resolve authored references that are
   * intentionally not mounted as custom properties in the current document. */
  entries?: readonly TokenEntry[];
  /** Changes whenever the Adapter publishes a new token inventory. */
  generation: string | number;
}

export interface BrowserCssInspectionConfig {
  document: Document;
  tokenKnowledge: BrowserTokenKnowledge;
}

/**
 * Cascade transform owned exclusively by this module:
 * - authored: interaction-state attribution (default; state defaults to base)
 * - live: raw CSSOM matching as currently painted
 * - stable: drops transient pseudo-class rules for editor token linking
 */
export type InspectionCascade = "authored" | "live" | "stable";

export interface BrowserCssInspectionOptions {
  state?: InteractionState;
  cascade?: InspectionCascade;
}

export type InspectionTargetStatus =
  | "attached"
  | "detached"
  | "foreign-document"
  | "unsupported"
  | "disabled"
  | "disposed";

export type InspectionDiagnosticCode =
  | "target-document-mismatch"
  | "target-detached"
  | "target-unsupported"
  | "state-unavailable"
  | "inspection-failed"
  | "production-disabled"
  | "session-disposed";

export interface InspectionDiagnostic {
  code: InspectionDiagnosticCode;
  message: string;
}

export interface InspectionRevision {
  element: number;
  stylesheet: number;
  tokenGeneration: string | number;
}

export interface InspectionSnapshot {
  target: { status: InspectionTargetStatus };
  cascade: InspectionCascade;
  requestedState: InteractionState;
  authoredState: InteractionState;
  /** Computed values describe what the browser is currently painting. */
  paintedState: "current";
  properties: readonly ResolvedProperty[];
  availableTokens: readonly TokenEntry[];
  availableStates: readonly InteractionState[];
  revision: InspectionRevision;
  diagnostics: readonly InspectionDiagnostic[];
}

export interface DocumentTokenInspectionSnapshot {
  /** Complete authored inventory supplied by the build-tool Adapter. */
  inventory: readonly TokenCatalogRow[];
  /** Tokens currently available below the inspected document root. */
  tokens: readonly TokenCatalogRow[];
  revision: InspectionRevision;
  diagnostics: readonly InspectionDiagnostic[];
}

export interface BrowserCssInspection {
  inspect(
    element: HTMLElement,
    options?: BrowserCssInspectionOptions,
  ): InspectionSnapshot;
  inspectTokens(root?: HTMLElement): DocumentTokenInspectionSnapshot;
  subscribe(listener: (revision: InspectionRevision) => void): () => void;
  /** Integration hook for managed CSSOM writes. */
  notifyStylesheetChange(): void;
  dispose(): void;
}

interface ElementTableCache {
  elementRevision: number;
  stylesheetRevision: number;
  availableTokens: readonly TokenEntry[];
  table: TokenTable;
}

function revisionSnapshot(
  revisions: DocumentRevisions,
  tokenGeneration: string | number,
): InspectionRevision {
  return {
    element: revisions.element,
    stylesheet: revisions.stylesheet,
    tokenGeneration,
  };
}

function targetStatus(
  element: HTMLElement,
  doc: Document,
): InspectionTargetStatus {
  if (element.ownerDocument !== doc) return "foreign-document";
  const HTMLElementConstructor = doc.defaultView?.HTMLElement;
  if (HTMLElementConstructor && !(element instanceof HTMLElementConstructor)) return "unsupported";
  return element.isConnected ? "attached" : "detached";
}

function targetDiagnostic(status: InspectionTargetStatus): InspectionDiagnostic | null {
  if (status === "foreign-document") {
    return {
      code: "target-document-mismatch",
      message: "The inspected element belongs to a different document than this session.",
    };
  }
  if (status === "unsupported") {
    return {
      code: "target-unsupported",
      message: "Browser CSS inspection currently supports HTMLElement targets only.",
    };
  }
  if (status === "detached") {
    return {
      code: "target-detached",
      message: "The inspected element is detached; browser evidence may be incomplete.",
    };
  }
  return null;
}

function emptySnapshot(
  status: InspectionTargetStatus,
  cascade: InspectionCascade,
  state: InteractionState,
  revision: InspectionRevision,
  diagnostics: readonly InspectionDiagnostic[],
): InspectionSnapshot {
  return {
    target: { status },
    cascade,
    requestedState: state,
    authoredState: cascade === "authored" ? state : "base",
    paintedState: "current",
    properties: [],
    availableTokens: [],
    availableStates: ["base"],
    revision,
    diagnostics,
  };
}

function cloneProperties(properties: readonly ResolvedProperty[]): readonly ResolvedProperty[] {
  return properties.map((property) => ({
    ...property,
    tokens: property.tokens?.map((token) => ({ ...token })),
    modifiers: property.modifiers?.map((modifier) => ({ ...modifier })),
    opacity: property.opacity ? { ...property.opacity, token: property.opacity.token && { ...property.opacity.token } } : undefined,
    structure: property.structure && { ...property.structure },
    atRules: property.atRules?.map((atRule) => ({ ...atRule })),
    evidence: { ...property.evidence },
  }));
}

function cloneEntries(entries: readonly TokenEntry[]): readonly TokenEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

function cloneCatalogRows(rows: readonly TokenCatalogRow[]): readonly TokenCatalogRow[] {
  return rows.map((row) => {
    const activeIndex = row.activeDeclaration
      ? row.definition.declarations.indexOf(row.activeDeclaration)
      : -1;
    const definition = {
      ...row.definition,
      declarations: row.definition.declarations.map((declaration) => ({
        ...declaration,
        context: {
          ...declaration.context,
          wrappers: declaration.context.wrappers?.map((wrapper) => ({ ...wrapper })),
        },
      })),
    };
    return {
      ...row,
      definition,
      activeDeclaration: activeIndex >= 0 ? definition.declarations[activeIndex] ?? null : null,
      styleContext: {
        ...row.styleContext,
        wrappers: row.styleContext.wrappers?.map((wrapper) => ({ ...wrapper })),
      },
    };
  });
}

function disabledInspection(config: BrowserCssInspectionConfig): BrowserCssInspection {
  const revision: InspectionRevision = {
    element: 0,
    stylesheet: 0,
    tokenGeneration: config.tokenKnowledge.generation,
  };
  const diagnostics: readonly InspectionDiagnostic[] = [{
    code: "production-disabled",
    message: "Browser CSS inspection is disabled outside development.",
  }];
  return {
    inspect(_element, options = {}) {
      return emptySnapshot(
        "disabled",
        options.cascade ?? "authored",
        options.state ?? "base",
        revision,
        diagnostics,
      );
    },
    inspectTokens() {
      return { inventory: [], tokens: [], revision, diagnostics };
    },
    subscribe() { return () => undefined; },
    notifyStylesheetChange() {},
    dispose() {},
  };
}

function notifyRevision(
  listener: (revision: InspectionRevision) => void,
  revisions: DocumentRevisions,
  tokenGeneration: string | number,
): void {
  listener(revisionSnapshot(revisions, tokenGeneration));
}

function resolveCascadeProperties(
  element: HTMLElement,
  table: TokenTable,
  cascade: InspectionCascade,
  state: InteractionState,
): ResolvedProperty[] {
  if (cascade === "live") return getResolvedProperties(element, table);
  if (cascade === "stable") return getResolvedPropertiesStable(element, table);
  return getResolvedPropertiesForState(element, table, state);
}

export function createBrowserCssInspection(
  config: BrowserCssInspectionConfig,
): BrowserCssInspection {
  if (!import.meta.env.DEV) return disabledInspection(config);

  const definitions = [...config.tokenKnowledge.definitions];
  const knowledgeEntries = [...(config.tokenKnowledge.entries ?? [])];
  const tokenGeneration = config.tokenKnowledge.generation;
  let disposed = false;
  const revisionUnsubscribers = new Set<() => void>();
  const elementTables = new WeakMap<HTMLElement, ElementTableCache>();
  // When compiler entries are merged ahead of runtime availability, keep one
  // table per availableTokens identity so resolver caches stay warm.
  const mergedTables = new WeakMap<readonly TokenEntry[], TokenTable>();
  const mediaCleanup: Array<() => void> = [];

  const mediaQueries = new Set(definitions.flatMap((definition) =>
    definition.declarations.flatMap((declaration) =>
      (declaration.context.wrappers ?? [])
        .filter((wrapper) => wrapper.kind === "media")
        .map((wrapper) => wrapper.params))));
  const ownerWindow = config.document.defaultView;
  if (ownerWindow && typeof ownerWindow.matchMedia === "function") {
    for (const query of mediaQueries) {
      const media = ownerWindow.matchMedia(query);
      const onChange = (): void => {
        if (!disposed) invalidateStyleResolutionCache(config.document);
      };
      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", onChange);
        mediaCleanup.push(() => media.removeEventListener("change", onChange));
      } else if (typeof media.addListener === "function") {
        media.addListener(onChange);
        mediaCleanup.push(() => media.removeListener(onChange));
      }
    }
  }

  const currentRevision = (): InspectionRevision =>
    revisionSnapshot(documentRevisions(config.document), tokenGeneration);

  function tokenTableFor(element: HTMLElement): {
    availableTokens: readonly TokenEntry[];
    table: TokenTable;
  } {
    const availableTokens = getAvailableTokenEntriesForElement(element, definitions);
    const revisions = documentRevisions(config.document);
    const cached = elementTables.get(element);
    if (
      cached
      && cached.elementRevision === revisions.element
      && cached.stylesheetRevision === revisions.stylesheet
      && cached.availableTokens === availableTokens
    ) {
      return { availableTokens: cached.availableTokens, table: cached.table };
    }

    let table: TokenTable;
    if (knowledgeEntries.length === 0) {
      // Same array identity as the availability cache → buildTokenTable hits.
      table = buildTokenTable(availableTokens);
    } else {
      const merged = mergedTables.get(availableTokens);
      if (merged) {
        table = merged;
      } else {
        table = buildTokenTable([...knowledgeEntries, ...availableTokens]);
        mergedTables.set(availableTokens, table);
      }
    }

    elementTables.set(element, {
      elementRevision: revisions.element,
      stylesheetRevision: revisions.stylesheet,
      availableTokens,
      table,
    });
    return { availableTokens, table };
  }

  const session: BrowserCssInspection = {
    inspect(element, options = {}) {
      const state = options.state ?? "base";
      const cascade = options.cascade ?? "authored";
      const status = disposed ? "disposed" : targetStatus(element, config.document);
      const diagnostics: InspectionDiagnostic[] = [];
      if (disposed) diagnostics.push({ code: "session-disposed", message: "This inspection session has been disposed." });
      else {
        const diagnostic = targetDiagnostic(status);
        if (diagnostic) diagnostics.push(diagnostic);
      }

      const revision = currentRevision();
      if (status !== "attached" && status !== "detached") {
        return emptySnapshot(status, cascade, state, revision, diagnostics);
      }

      try {
        const { availableTokens, table } = tokenTableFor(element);
        const availableStates = getAvailableInteractionStates(element);
        if (cascade === "authored" && state !== "base" && !availableStates.includes(state)) {
          diagnostics.push({
            code: "state-unavailable",
            message: `The ${state} interaction state has no matching authored rule for this element.`,
          });
        }
        const properties = resolveCascadeProperties(element, table, cascade, state);
        return {
          target: { status },
          cascade,
          requestedState: state,
          authoredState: cascade === "authored" ? state : "base",
          paintedState: "current",
          properties: cloneProperties(properties),
          availableTokens: cloneEntries(availableTokens),
          availableStates: [...availableStates],
          revision,
          diagnostics,
        };
      } catch (error) {
        diagnostics.push({
          code: "inspection-failed",
          message: error instanceof Error ? error.message : "Browser CSS inspection failed.",
        });
        return emptySnapshot(status, cascade, state, revision, diagnostics);
      }
    },

    inspectTokens(root = config.document.documentElement) {
      const diagnostics: InspectionDiagnostic[] = [];
      const revision = currentRevision();
      if (disposed) {
        diagnostics.push({ code: "session-disposed", message: "This inspection session has been disposed." });
        return { inventory: [], tokens: [], revision, diagnostics };
      }
      if (root.ownerDocument !== config.document) {
        diagnostics.push({
          code: "target-document-mismatch",
          message: "The token inspection root belongs to a different document than this session.",
        });
        return { inventory: [], tokens: [], revision, diagnostics };
      }
      try {
        registerResolutionElement(root);
        const catalog = getAvailableTokenCatalog(root, definitions);
        return {
          inventory: cloneCatalogRows(buildTokenCatalogRows(definitions, root)),
          tokens: cloneCatalogRows(buildTokenCatalogRows(catalog, root)),
          revision,
          diagnostics,
        };
      } catch (error) {
        diagnostics.push({
          code: "inspection-failed",
          message: error instanceof Error ? error.message : "Browser token inspection failed.",
        });
        return { inventory: [], tokens: [], revision, diagnostics };
      }
    },

    subscribe(listener) {
      if (disposed) return () => undefined;
      const unsubscribe = subscribeDocumentRevision(config.document, (revisions) => {
        if (!disposed) notifyRevision(listener, revisions, tokenGeneration);
      });
      revisionUnsubscribers.add(unsubscribe);
      return () => {
        unsubscribe();
        revisionUnsubscribers.delete(unsubscribe);
      };
    },

    notifyStylesheetChange() {
      if (!disposed) invalidateStyleResolutionCache(config.document);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      revisionUnsubscribers.forEach((unsubscribe) => unsubscribe());
      revisionUnsubscribers.clear();
      mediaCleanup.forEach((cleanup) => cleanup());
      mediaCleanup.length = 0;
    },
  };

  return session;
}
