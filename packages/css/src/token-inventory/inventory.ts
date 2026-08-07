/**
 * The token inventory engine.
 *
 * Aggregates stylesheet artifacts and Adapter-contributed literal tokens into
 * deterministic, immutable snapshots. It never reads the filesystem, invokes
 * Vite, resolves modules, executes user configuration, loads runtime
 * documents, or serializes a virtual module — those are Adapter
 * responsibilities (Stage 2 plan, "Responsibilities behind the seam").
 */
import type { TokenDefinition, TokenEntry } from "../model/index.ts";
import { parseStylesheetArtifact, type ParsedContribution } from "./parseStylesheet.ts";
import type {
  AdapterContributions,
  InventoryDiagnostic,
  InventoryOrderEvidence,
  InventorySnapshot,
  InventoryTokenDeclaration,
  InventoryTokenDefinition,
  StylesheetArtifact,
} from "./types.ts";

interface StoredRow {
  readonly artifact: StylesheetArtifact;
  readonly contribution: ParsedContribution;
}

function artifactKey(artifact: Pick<StylesheetArtifact, "buildTool" | "id" | "stage">): string {
  return `${artifact.buildTool}\u0000${artifact.id}\u0000${artifact.stage}`;
}

function compareArtifacts(a: StylesheetArtifact, b: StylesheetArtifact): number {
  const aHasStylesheetOrder = a.order !== undefined;
  const bHasStylesheetOrder = b.order !== undefined;
  if (aHasStylesheetOrder !== bHasStylesheetOrder) return aHasStylesheetOrder ? -1 : 1;
  if (aHasStylesheetOrder && bHasStylesheetOrder && a.order !== b.order) return a.order! - b.order!;
  const discoveryOrder = (a.discoveryOrder ?? Infinity) - (b.discoveryOrder ?? Infinity);
  return discoveryOrder || artifactKey(a).localeCompare(artifactKey(b));
}

function sameArtifactFacts(a: StylesheetArtifact, b: StylesheetArtifact): boolean {
  return a.buildTool === b.buildTool
    && a.id === b.id
    && a.stage === b.stage
    && a.provenance === b.provenance
    && a.order === b.order
    && a.discoveryOrder === b.discoveryOrder
    && a.content === b.content
    && JSON.stringify(a.diagnostics ?? []) === JSON.stringify(b.diagnostics ?? []);
}

function copyArtifact(artifact: StylesheetArtifact): StylesheetArtifact {
  return {
    ...artifact,
    ...(artifact.diagnostics
      ? { diagnostics: artifact.diagnostics.map((diagnostic) => ({ ...diagnostic })) }
      : {}),
  };
}

function copyAdapterContributions(contributions: AdapterContributions): AdapterContributions {
  return {
    tokens: contributions.tokens.map((entry) => ({ ...entry })),
    diagnostics: contributions.diagnostics?.map((diagnostic) => ({ ...diagnostic })) ?? [],
  };
}

function sameAdapterContributions(a: AdapterContributions, b: AdapterContributions): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function artifactOrderEvidence(sortedRows: readonly StoredRow[]): ReadonlyMap<string, InventoryOrderEvidence> {
  const discoveryRows = sortedRows.filter(({ artifact }) => artifact.order === undefined);
  const explicitDiscoveryIndexes = discoveryRows.flatMap(({ artifact }) =>
    artifact.discoveryOrder === undefined ? [] : [artifact.discoveryOrder]);
  let nextDerivedIndex = explicitDiscoveryIndexes.length > 0
    ? Math.max(...explicitDiscoveryIndexes) + 1
    : 0;
  const evidence = new Map<string, InventoryOrderEvidence>();
  for (const { artifact } of sortedRows) {
    evidence.set(artifactKey(artifact), artifact.order !== undefined
      ? { kind: "stylesheet", index: artifact.order }
      : { kind: "discovery", index: artifact.discoveryOrder ?? nextDerivedIndex++ });
  }
  return evidence;
}

/** FNV-1a 32-bit hash; a small pure-JS fingerprint with no Node dependency. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Canonical serialization of the observable inventory facts. Only these facts
 * feed the generation fingerprint, so generation changes exactly when they do.
 */
function canonicalSnapshotFacts(
  definitions: readonly InventoryTokenDefinition[],
  diagnostics: readonly InventoryDiagnostic[],
): string {
  const parts: string[] = [];
  for (const definition of definitions) {
    parts.push(
      `D\x00${definition.cssName}\x00${definition.name}\x00${definition.origin ?? ""}`
      + `\x00${String(definition.editable ?? "")}\x00${definition.adapter ?? ""}`
      + `\x00${definition.cssValue ?? ""}`,
    );
    for (const declaration of definition.declarations) {
      parts.push(
        `d\x00${declaration.id ?? ""}\x00${String(declaration.order ?? "")}`
        + `\x00${declaration.value}\x00${declaration.source}\x00${String(declaration.important)}`
        + `\x00${JSON.stringify(declaration.context)}\x00${JSON.stringify(declaration.contribution)}`,
      );
    }
  }
  for (const diagnostic of diagnostics) {
    parts.push(
      `X\x00${diagnostic.code}\x00${diagnostic.artifact ?? ""}\x00${diagnostic.module ?? ""}`
      + `\x00${diagnostic.exportName ?? ""}\x00${diagnostic.message}`,
    );
  }
  return parts.join("\n");
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return Object.freeze(value);
}

export interface TokenInventory {
  /** Create, update, or remove rows for one artifact. */
  apply(artifact: StylesheetArtifact): void;
  /** Immutable snapshot with deterministic order and generation. */
  snapshot(): InventorySnapshot;
  /** Replace normalized literal-token and diagnostic contributions from styling Adapters. */
  setAdapterContributions(contributions: AdapterContributions): void;
}

export function createTokenInventory(): TokenInventory {
  const rows = new Map<string, StoredRow>();
  let adapterContributions: AdapterContributions = { tokens: [], diagnostics: [] };
  let snapshotCache: InventorySnapshot | null = null;

  function invalidate(): void {
    snapshotCache = null;
  }

  function apply(artifact: StylesheetArtifact): void {
    const key = artifactKey(artifact);
    const hasDiagnostics = (artifact.diagnostics?.length ?? 0) > 0;
    if (artifact.content === undefined && !hasDiagnostics) {
      if (rows.delete(key)) invalidate();
      return;
    }
    const storedArtifact = copyArtifact(artifact);
    const existing = rows.get(key);
    if (existing && sameArtifactFacts(existing.artifact, artifact)) return;
    const parsed = artifact.content === undefined
      ? { definitions: [], diagnostics: [] }
      : parseStylesheetArtifact(storedArtifact);
    const contributedDiagnostics: InventoryDiagnostic[] = (storedArtifact.diagnostics ?? []).map(
      (diagnostic) => ({ ...diagnostic, artifact: storedArtifact.id }),
    );
    rows.set(key, {
      artifact: storedArtifact,
      contribution: {
        definitions: parsed.definitions,
        diagnostics: [...contributedDiagnostics, ...parsed.diagnostics],
      },
    });
    invalidate();
  }

  function setAdapterContributions(contributions: AdapterContributions): void {
    if (sameAdapterContributions(adapterContributions, contributions)) return;
    adapterContributions = copyAdapterContributions(contributions);
    invalidate();
  }

  function snapshot(): InventorySnapshot {
    if (snapshotCache) return snapshotCache;

    const sortedRows = [...rows.values()].sort((a, b) => compareArtifacts(a.artifact, b.artifact));
    const orderEvidence = artifactOrderEvidence(sortedRows);

    // Group by cssName in artifact order; later artifacts append declarations.
    // Definition-level provenance/editability come from the FIRST declaring
    // artifact (legacy `load()` parity: the first file wins). Every declaration
    // also retains its own contribution evidence so later origins are not lost.
    // Package artifacts are non-editable; every other provenance is editable.
    type DefinitionBase = Omit<TokenDefinition, "declarations">;
    const merged = new Map<string, { base: DefinitionBase; declarations: InventoryTokenDeclaration[] }>();
    let provisionalOrder = 0;
    for (const { artifact, contribution } of sortedRows) {
      const declarations = contribution.definitions
        .flatMap((definition) => definition.declarations.map((declaration) => ({ definition, declaration })))
        .sort((a, b) => (a.declaration.order ?? 0) - (b.declaration.order ?? 0));
      for (const { definition, declaration } of declarations) {
        const existing = merged.get(definition.cssName);
        const enriched: InventoryTokenDeclaration = {
          ...declaration,
          order: provisionalOrder++,
          contribution: {
            kind: "stylesheet",
            buildTool: artifact.buildTool,
            id: artifact.id,
            stage: artifact.stage,
            provenance: artifact.provenance,
            editable: artifact.provenance !== "package",
            orderEvidence: orderEvidence.get(artifactKey(artifact))!,
          },
        };
        if (existing) {
          existing.declarations.push(enriched);
        } else {
          const { declarations: _declarations, ...definitionBase } = definition;
          const base: DefinitionBase = {
            ...definitionBase,
            origin: artifact.provenance,
          };
          if (artifact.provenance === "package") base.editable = false;
          merged.set(definition.cssName, { base, declarations: [enriched] });
        }
      }
    }

    // Adapter literal tokens merge last, replacing any stylesheet definition
    // with the same key (legacy `load()` parity for Tailwind v3 config tokens).
    const sortedAdapterTokens = [...adapterContributions.tokens]
      .sort((a, b) => (a.cssName ?? a.name).localeCompare(b.cssName ?? b.name));
    for (const [adapterOrder, entry] of sortedAdapterTokens.entries()) {
      const key = entry.cssName ?? entry.name;
      merged.set(key, {
        base: {
          cssName: key,
          name: entry.name,
          cssValue: entry.cssValue,
          adapter: entry.adapter,
          origin: entry.origin,
          editable: entry.editable,
        },
        declarations: [{
          id: `adapter\x00${key}\x00${entry.source}\x00${entry.value}`,
          order: provisionalOrder++,
          value: entry.value,
          source: entry.source,
          important: false,
          context: {},
          contribution: {
            kind: "adapter",
            id: entry.adapter ?? entry.source,
            provenance: entry.origin,
            editable: entry.editable,
            order: adapterOrder,
          },
        }],
      });
    }

    // Adapter replacement can remove an earlier stylesheet definition. Remap
    // surviving provisional positions so the public global order is compact.
    const survivingDeclarations = [...merged.values()]
      .flatMap(({ declarations }) => declarations)
      .sort((a, b) => a.order - b.order);
    const finalOrder = new Map(survivingDeclarations.map((declaration, order) => [declaration, order]));
    const definitions: InventoryTokenDefinition[] = [];
    for (const { base, declarations } of merged.values()) {
      definitions.push({
        ...base,
        declarations: declarations.map((declaration) => ({
          ...declaration,
          order: finalOrder.get(declaration)!,
        })),
      });
    }

    const tokens: TokenEntry[] = definitions.map((definition) => ({
      name: definition.name,
      cssName: definition.cssName,
      value: definition.declarations[0]?.value ?? "",
      source: definition.declarations[0]?.source ?? "",
      cssValue: definition.cssValue,
      adapter: definition.adapter,
      origin: definition.origin,
      editable: definition.editable,
    }));

    const diagnostics: InventoryDiagnostic[] = [];
    for (const { contribution } of sortedRows) {
      diagnostics.push(...contribution.diagnostics);
    }
    diagnostics.push(...(adapterContributions.diagnostics ?? []));

    const generation = `g${fnv1a(canonicalSnapshotFacts(definitions, diagnostics))}`;
    snapshotCache = deepFreeze({
      generation,
      definitions,
      tokens,
      diagnostics,
    });
    return snapshotCache;
  }

  return { apply, snapshot, setAdapterContributions };
}
