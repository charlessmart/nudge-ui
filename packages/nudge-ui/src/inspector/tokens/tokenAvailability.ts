import type { TokenDefinition, TokenEntry, TokenTable } from "../../css/model/index.ts";
import { interpretValue } from "../../css/value-semantics/index.ts";
import { getElementComputedStyle } from "../runtime/domRealm.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { createInspectorValueContext } from "./valueSemanticsAdapter.ts";
import {
  collectRules as collectCssomRules,
  documentRevisions as getDocumentRevisions,
  registerResolutionLineage,
} from "./resolution/cssomCollector.ts";

const tokenTableMemo = new WeakMap<readonly TokenEntry[], TokenTable>();

export function buildTokenTable(entries: readonly TokenEntry[]): TokenTable {
  const cached = tokenTableMemo.get(entries);
  if (cached) return cached;
  const table: TokenTable = {};
  for (const entry of entries) {
    table[entry.name] = entry;
    if (entry.cssName) table[entry.cssName] = entry;
  }
  tokenTableMemo.set(entries, table);
  return table;
}

let tableCache: TokenTable | null = null;
let tableSource: readonly TokenEntry[] | null = null;

export function getTokenTable(): TokenTable {
  const { tokens } = getNudgeUiRuntimeConfig();
  if (tableCache !== null && tableSource === tokens) return tableCache;
  tableCache = buildTokenTable(tokens);
  tableSource = tokens;
  return tableCache;
}

function isCustomPropertyToken(definition: TokenDefinition): boolean {
  return definition.cssName.startsWith("--");
}

function entryFromDefinition(definition: TokenDefinition, value: string): TokenEntry {
  return {
    name: definition.name,
    cssName: definition.cssName,
    value,
    source: definition.declarations[0]?.source ?? "",
    cssValue: definition.cssValue,
    adapter: definition.adapter,
    origin: definition.origin,
    editable: definition.editable,
  };
}

interface TokenEntriesCacheEntry {
  elementRevision: number;
  stylesheetRevision: number;
  definitions: readonly TokenDefinition[];
  entries: TokenEntry[];
}

const tokenEntriesCache = new WeakMap<HTMLElement, TokenEntriesCacheEntry>();

/**
 * The build-time catalog is intentionally an inventory of every project token.
 * Element edits must instead use only custom properties resolved in that
 * element's cascade; a token defined by a lazy stylesheet is not usable until
 * that stylesheet is attached to the document. Entries are cached per element
 * until the element or stylesheet revision changes; the derived table reuses
 * `buildTokenTable`'s input-identity memo.
 */
export function getAvailableTokenEntriesForElement(
  el: HTMLElement,
  definitions: readonly TokenDefinition[] = getNudgeUiRuntimeConfig().tokenCatalog,
): TokenEntry[] {
  const revisions = getDocumentRevisions(el.ownerDocument ?? document);
  const cached = tokenEntriesCache.get(el);
  if (cached && cached.elementRevision === revisions.element
    && cached.stylesheetRevision === revisions.stylesheet
    && cached.definitions === definitions) {
    return cached.entries;
  }
  registerResolutionLineage(el);
  const computed = getElementComputedStyle(el);
  const available = definitions.flatMap((definition) => {
    if (!isCustomPropertyToken(definition)) {
      // Literal adapters (for example Tailwind v3) do not have a browser
      // custom property to probe. Their adapter owns their availability.
      return [entryFromDefinition(definition, definition.declarations[0]?.value ?? "")];
    }
    const value = computed.getPropertyValue(definition.cssName).trim();
    return value ? [entryFromDefinition(definition, value)] : [];
  });
  const intermediateTable = buildTokenTable(available);
  const entries = available.map((entry) => ({
    ...entry,
    value: interpretValue("--nudge-ui-token", entry.value, createInspectorValueContext(intermediateTable))[0]!.resolvedValue,
  }));
  tokenEntriesCache.set(el, {
    elementRevision: revisions.element,
    stylesheetRevision: revisions.stylesheet,
    definitions,
    entries,
  });
  return entries;
}

/**
 * Replaces build-time token declaration hints with declarations serialized by
 * the browser from the stylesheets currently attached to this document.
 */
function hydrateTokenCatalogFromCssom(
  definitions: readonly TokenDefinition[],
  doc: Document = document,
): TokenDefinition[] {
  const needsHydration = (definition: TokenDefinition): boolean =>
    definition.declarations.length === 0
    || (definition.adapter === "vanilla-extract" && definition.declarations.every((declaration) =>
      declaration.value.trim() === `var(${definition.cssName})`
      && !declaration.context.selector
      && !declaration.context.wrappers?.length));
  const known = new Set(definitions.filter(needsHydration).map((definition) => definition.cssName));
  const declarations = new Map<string, TokenDefinition["declarations"]>();
  for (const rule of collectCssomRules(doc).rules) {
    if (rule.source === "#nudge-ui-styles") continue;
    for (const declaration of rule.declarations) {
      if (!known.has(declaration.property)) continue;
      const wrappers = [
        ...(rule.layer ? [{ kind: "layer" as const, params: rule.layer }] : []),
        ...(rule.atRules ?? []).flatMap((atRule) =>
          atRule.kind === "media" || atRule.kind === "supports"
            ? [{ kind: atRule.kind, params: atRule.params }]
            : []),
      ];
      const list = declarations.get(declaration.property) ?? [];
      list.push({
        id: `${declaration.property}\u0000${rule.source ?? "cssom"}\u0000${rule.sourceOrder ?? list.length}`,
        order: rule.sourceOrder,
        value: declaration.value,
        source: rule.source ?? "cssom",
        important: Boolean(declaration.important),
        context: {
          selector: rule.selectorText,
          ...(wrappers.length > 0 ? { wrappers } : {}),
        },
      });
      declarations.set(declaration.property, list);
    }
  }
  return definitions.map((definition) => {
    if (!needsHydration(definition)) return definition;
    const accepted = declarations.get(definition.cssName);
    return accepted?.length ? { ...definition, declarations: accepted } : definition;
  });
}

function sourceFile(source: string): string {
  return source.replace(/:\d+$/, "").split(/[?#]/, 1)[0] ?? source;
}

function normalizedPath(value: string): string {
  return decodeURIComponent(value).replace(/\\/g, "/").replace(/^file:\/\//, "").replace(/\/+$/, "");
}

interface LoadedStylesheetSource {
  readonly path: string;
  readonly providesAuthoredIdentity: boolean;
}

function loadedStylesheetSources(doc: Document): LoadedStylesheetSource[] {
  const sourceIdentityByPath = new Map<string, boolean>();
  for (const node of doc.querySelectorAll<HTMLStyleElement | HTMLLinkElement>(
    'style[data-vite-dev-id], link[rel~="stylesheet"][href]',
  )) {
    const providesAuthoredIdentity = node.tagName === "STYLE";
    const source = providesAuthoredIdentity
      ? (node as HTMLStyleElement).dataset.viteDevId
      : node.getAttribute("href");
    if (!source) continue;
    const path = normalizedPath(source.split(/[?#]/, 1)[0] ?? source);
    sourceIdentityByPath.set(
      path,
      providesAuthoredIdentity || sourceIdentityByPath.get(path) === true,
    );
  }
  return Array.from(sourceIdentityByPath, ([path, providesAuthoredIdentity]) => ({
    path,
    providesAuthoredIdentity,
  }));
}

function isLoadedCssSource(source: string, loadedSources: string[]): boolean {
  const file = sourceFile(source);
  if (!/\.css$/i.test(file) || loadedSources.length === 0) return true;
  const normalizedFile = normalizedPath(file);
  return loadedSources.some((loaded) => loaded === normalizedFile
    || loaded.endsWith(`/${normalizedFile}`)
    || normalizedFile.endsWith(`/${loaded}`));
}

/**
 * Returns stylesheet identities only when the browser gave us a complete,
 * authored-source mapping. A compiled host can expose a mixture of source-like
 * and opaque CSS URLs; treating the mapped subset as complete would make
 * declarations behind the opaque URLs look lazy even while their variables are
 * live in the document.
 */
function confidentlyLoadedStylesheetSources(
  definitions: readonly TokenDefinition[],
  loadedSources: readonly LoadedStylesheetSource[],
): string[] {
  const cssSources = definitions.flatMap((definition) =>
    definition.declarations
      .map((declaration) => declaration.source)
      .filter((source) => /\.css$/i.test(sourceFile(source))));
  const known = new Set<string>();
  for (const loaded of loadedSources) {
    if (loaded.providesAuthoredIdentity
      || cssSources.some((source) => isLoadedCssSource(source, [loaded.path]))) {
      known.add(loaded.path);
      continue;
    }
    // One opaque compiled URL can contain any authored declaration, so the
    // document does not provide enough evidence to remove unloaded sources.
    return [];
  }
  return [...known];
}

/**
 * Produces the page catalog used by the global Tokens settings section. When
 * the document exposes mappable source identities, declarations from unloaded
 * CSS files are removed. Opaque compiled URLs leave the adapter catalog intact.
 */
export function getAvailableTokenCatalog(
  root: HTMLElement = document.documentElement,
  definitions: readonly TokenDefinition[] = getNudgeUiRuntimeConfig().tokenCatalog,
): TokenDefinition[] {
  const computed = getElementComputedStyle(root);
  const hydrated = hydrateTokenCatalogFromCssom(definitions, root.ownerDocument ?? document);
  const loadedSources = confidentlyLoadedStylesheetSources(
    hydrated,
    loadedStylesheetSources(root.ownerDocument ?? document),
  );
  return hydrated.flatMap((definition) => {
    if (!isCustomPropertyToken(definition)) return [definition];
    if (!computed.getPropertyValue(definition.cssName).trim()) return [];
    const declarations = definition.declarations.filter((declaration) =>
      isLoadedCssSource(declaration.source, loadedSources));
    return declarations.length > 0 ? [{ ...definition, declarations }] : [];
  });
}
