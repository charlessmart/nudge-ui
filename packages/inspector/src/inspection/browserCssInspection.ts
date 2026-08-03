import type { TokenDefinition, TokenEntry } from "virtual:design-tokens";
import { INTERACTION_STATES } from "../styleState.ts";
import type { InteractionState } from "../styleState.ts";
import {
  buildTokenTable,
  getAvailableInteractionStates,
  getAvailableTokenEntriesForElement,
  getResolvedProperties,
  getResolvedPropertiesForState,
  invalidateStyleResolutionCache,
} from "../tokens/resolution.ts";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import {
  documentRevisions,
  subscribeDocumentRevision,
  type DocumentRevisions,
} from "../tokens/resolution/cssomCollector.ts";

export interface BrowserTokenKnowledge {
  /** Build-time definitions normalized by a build-tool Adapter. */
  definitions: readonly TokenDefinition[];
  /** Changes whenever the Adapter publishes a new token inventory. */
  generation: string | number;
}

export interface BrowserCssInspectionConfig {
  document: Document;
  tokenKnowledge: BrowserTokenKnowledge;
}

export interface BrowserCssInspectionOptions {
  state?: InteractionState;
}

export type InspectionTargetStatus =
  | "attached"
  | "detached"
  | "foreign-document"
  | "unsupported"
  | "disposed";

export type InspectionDiagnosticCode =
  | "target-document-mismatch"
  | "target-detached"
  | "target-unsupported"
  | "state-unavailable"
  | "inspection-failed"
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

export interface BrowserCssInspection {
  inspect(
    element: HTMLElement,
    options?: BrowserCssInspectionOptions,
  ): InspectionSnapshot;
  subscribe(listener: (revision: InspectionRevision) => void): () => void;
  /** Integration hook for managed CSSOM writes. */
  notifyStylesheetChange(): void;
  dispose(): void;
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
  state: InteractionState,
  revision: InspectionRevision,
  diagnostics: readonly InspectionDiagnostic[],
): InspectionSnapshot {
  return {
    target: { status },
    requestedState: state,
    authoredState: state,
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

function notifyRevision(
  listener: (revision: InspectionRevision) => void,
  revisions: DocumentRevisions,
  tokenGeneration: string | number,
): void {
  listener(revisionSnapshot(revisions, tokenGeneration));
}

export function createBrowserCssInspection(
  config: BrowserCssInspectionConfig,
): BrowserCssInspection {
  const definitions = [...config.tokenKnowledge.definitions];
  const tokenGeneration = config.tokenKnowledge.generation;
  let disposed = false;
  const revisionUnsubscribers = new Set<() => void>();

  const currentRevision = (): InspectionRevision =>
    revisionSnapshot(documentRevisions(config.document), tokenGeneration);

  const session: BrowserCssInspection = {
    inspect(element, options = {}) {
      const state = options.state ?? "base";
      const status = disposed ? "disposed" : targetStatus(element, config.document);
      const diagnostics: InspectionDiagnostic[] = [];
      if (disposed) diagnostics.push({ code: "session-disposed", message: "This inspection session has been disposed." });
      else {
        const diagnostic = targetDiagnostic(status);
        if (diagnostic) diagnostics.push(diagnostic);
      }

      const revision = currentRevision();
      if (status !== "attached" && status !== "detached") {
        return emptySnapshot(status, state, revision, diagnostics);
      }

      try {
        const availableTokens = getAvailableTokenEntriesForElement(element, definitions);
        const table = buildTokenTable(availableTokens);
        const availableStates = getAvailableInteractionStates(element);
        if (state !== "base" && !availableStates.includes(state)) {
          diagnostics.push({
            code: "state-unavailable",
            message: `The ${state} interaction state has no matching authored rule for this element.`,
          });
        }
        const properties = state === "base"
          ? getResolvedProperties(element, table)
          : getResolvedPropertiesForState(element, table, state);
        return {
          target: { status },
          requestedState: state,
          authoredState: state,
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
        return emptySnapshot(status, state, revision, diagnostics);
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
    },
  };

  return session;
}
