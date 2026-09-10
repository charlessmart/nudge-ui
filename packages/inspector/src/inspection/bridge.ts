import type { TokenDefinition, TokenEntry } from "@nudge-ui/css/model";
import { getChangesList, getPendingRules, isPreviewableChange } from "../changes/changesLog.ts";
import { detectFramework } from "../prompt/detectFramework.ts";
import { generatePrompt } from "../prompt/generatePrompt.ts";
import { loadCustomInstructions } from "../prompt/promptSettings.ts";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
import { projectInspectorValues } from "../spacing/projection.ts";
import type { InspectorProjection } from "../spacing/projection.ts";
import type { ResolvedProperty } from "@nudge-ui/css/model";
import { selectTokens } from "@nudge-ui/css/value-semantics";
import {
  createBrowserCssInspection,
  type DocumentTokenInspectionSnapshot,
  type InspectionSnapshot,
} from "./browserCssInspection.ts";
import { getBrowserCssInspection } from "./browserCssInspectionRegistry.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";

export const NUDGE_UI_INSPECTION_VERSION = 1 as const;

export interface InspectionCatalogEntry {
  name: string;
  cssName: string;
  adapter?: string;
  origin?: TokenEntry["origin"];
  editable?: boolean;
  declarations: Array<{
    value: string;
    source: string;
    important: boolean;
    context: TokenDefinition["declarations"][number]["context"];
  }>;
}

export interface InspectionControl {
  property: string;
  kind: "token" | "raw";
  activeToken: string | null;
  suggestions: string[];
}

export interface ElementInspection {
  version: typeof NUDGE_UI_INSPECTION_VERSION;
  identity: {
    cid: string | null;
    src: string;
    file: string;
    line: number;
    column: number;
  };
  catalog: InspectionCatalogEntry[];
  availableTokens: TokenEntry[];
  properties: ResolvedProperty[];
  projection: InspectorProjection;
  controls: InspectionControl[];
  changes: ReturnType<typeof getChangesList>;
  managedPreview: {
    rules: ReturnType<typeof getPendingRules>;
    results: Array<{
      property: string;
      requestedValue: string;
      computedValue: string;
      status: "applied" | "conflict";
      reason?: string;
    }>;
  };
  prompt: string | null;
}

export interface InspectElementOptions {
  catalog?: readonly TokenDefinition[];
  tokens?: readonly TokenEntry[];
}

function inspectBrowserFacts(
  element: HTMLElement,
  definitions: readonly TokenDefinition[],
  entries?: readonly TokenEntry[],
) {
  const doc = element.ownerDocument ?? document;
  if (definitions === getNudgeUiRuntimeConfig().tokenCatalog && entries === undefined) {
    const session = getBrowserCssInspection(doc);
    return {
      element: session.inspect(element, { cascade: "live" }),
      tokens: session.inspectTokens(element),
    };
  }

  // Compatibility callers may provide a fixture-local catalog. Keep that
  // Adapter isolated from the document registry so one caller cannot replace
  // the token knowledge used by the live inspector session.
  const session = createBrowserCssInspection({
    document: doc,
    tokenKnowledge: { definitions, entries, generation: "compatibility" },
  });
  try {
    return {
      element: session.inspect(element, { cascade: "live" }),
      tokens: session.inspectTokens(element),
    };
  } finally {
    session.dispose();
  }
}

function catalogEntry(definition: TokenDefinition): InspectionCatalogEntry {
  return {
    name: definition.name,
    cssName: definition.cssName,
    adapter: definition.adapter,
    origin: definition.origin,
    editable: definition.editable,
    declarations: definition.declarations.map((declaration) => ({
      value: declaration.value,
      source: declaration.source,
      important: declaration.important,
      context: declaration.context,
    })),
  };
}

/**
 * Returns the inspector's stable, read-only facts for one rendered element.
 * Compatibility tests and the React UI cross the same resolver/projection seam;
 * this function deliberately performs no selection or edit side effects.
 */
export function inspectElement(
  element: HTMLElement,
  options: InspectElementOptions = {},
): ElementInspection {
  const runtimeConfig = getNudgeUiRuntimeConfig();
  const definitions = options.catalog ?? runtimeConfig.tokenCatalog;
  const frameworkHints = options.tokens
    ? detectFramework(options.tokens)
    : {
      framework: runtimeConfig.framework,
      stylingSystem: runtimeConfig.stylingSystem,
    };
  const browserFacts = inspectBrowserFacts(element, definitions, options.tokens);
  const availableTokens = options.tokens ? [...options.tokens] : [...browserFacts.element.availableTokens];
  const properties: ResolvedProperty[] = [...browserFacts.element.properties];
  const selection = resolveSelectionFromElement(element);
  const changes = getChangesList();
  const customInstructions = loadCustomInstructions(runtimeConfig.projectId);
  const managedPreview = {
    rules: getPendingRules(),
    results: changes.flatMap((change) =>
      isPreviewableChange(change) && change.previewResult
        ? [{ property: change.property, ...change.previewResult }]
        : []),
  };
  // Local vanilla-extract themes attach contract variables to a theme class,
  // not necessarily :root. The selected element is therefore the correct
  // availability context for an element inspection.
  const controls = properties
    .filter((property) => !property.property.startsWith("--"))
    .map((property): InspectionControl => ({
      property: property.property,
      kind: property.tokenName ? "token" : "raw",
      activeToken: property.tokenName,
      suggestions: Array.from(new Set(selectTokens({
        property: property.property,
        entries: availableTokens,
        currentToken: property.tokenName,
      }).candidates.map((candidate) => candidate.entry.name))),
    }));

  return {
    version: NUDGE_UI_INSPECTION_VERSION,
    identity: {
      cid: selection?.cid ?? element.getAttribute("data-cid"),
      src: selection?.src ?? element.getAttribute("data-src") ?? "",
      file: selection?.file ?? "",
      line: selection?.line ?? 0,
      column: selection?.column ?? 0,
    },
    catalog: browserFacts.tokens.tokens.map((row) => catalogEntry(row.definition)),
    availableTokens,
    properties,
    projection: projectInspectorValues(element, properties),
    controls,
    changes,
    managedPreview,
    prompt: changes.length > 0
      ? generatePrompt(changes, frameworkHints, [], customInstructions)
      : null,
  };
}

export interface NudgeUiInspectionBridge {
  version: typeof NUDGE_UI_INSPECTION_VERSION;
  inspect(selector: string): ElementInspection | null;
}

declare global {
  interface Window {
    __nudgeUi?: NudgeUiInspectionBridge;
  }
}

/** Installs the dev-only browser seam used by compatibility applications. */
export function installInspectionBridge(target: Window = window): () => void {
  const bridge: NudgeUiInspectionBridge = {
    version: NUDGE_UI_INSPECTION_VERSION,
    inspect(selector) {
      const element = target.document.querySelector(selector);
      return element instanceof HTMLElement ? inspectElement(element) : null;
    },
  };
  target.__nudgeUi = bridge;
  return () => {
    if (target.__nudgeUi === bridge) delete target.__nudgeUi;
  };
}
