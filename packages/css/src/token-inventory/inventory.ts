/**
 * Build-tool-neutral token inventory with authored/transformed reconciliation
 * and normalized styling contributions.
 */
import type { TokenDefinition, TokenEntry } from "../model/index.ts";
import { parseStylesheetArtifact, type ParsedContribution } from "./parseStylesheet.ts";
import type {
  InventoryContribution,
  InventoryDiagnostic,
  InventoryOrderEvidence,
  InventorySnapshot,
  InventoryTokenDeclaration,
  InventoryTokenDefinition,
  StylesheetArtifact,
  TokenContribution,
} from "./types.ts";

interface StoredObservation {
  readonly artifact: StylesheetArtifact;
  readonly contribution: ParsedContribution;
}

interface StoredArtifact {
  readonly buildTool: string;
  readonly id: string;
  authored?: StoredObservation;
  transformed?: StoredObservation;
  transformFailed?: boolean;
}

type DefinitionBase = Omit<TokenDefinition, "declarations">;
interface MutableDefinition {
  base: DefinitionBase;
  declarations: InventoryTokenDeclaration[];
}

function artifactKey(value: Pick<StylesheetArtifact, "buildTool" | "id">): string {
  return `${value.buildTool}\u0000${value.id}`;
}

function effectiveObservation(entry: StoredArtifact): StoredObservation | undefined {
  return entry.transformFailed ? entry.authored : (entry.transformed ?? entry.authored);
}

function effectiveOrder(entry: StoredArtifact): number | undefined {
  return effectiveObservation(entry)?.artifact.order ?? entry.authored?.artifact.order;
}

function effectiveDiscoveryOrder(entry: StoredArtifact): number | undefined {
  return effectiveObservation(entry)?.artifact.discoveryOrder
    ?? entry.authored?.artifact.discoveryOrder;
}

function compareArtifacts(a: StoredArtifact, b: StoredArtifact): number {
  const aOrder = effectiveOrder(a);
  const bOrder = effectiveOrder(b);
  const aHasOrder = aOrder !== undefined;
  const bHasOrder = bOrder !== undefined;
  if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;
  if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  const discovery = (effectiveDiscoveryOrder(a) ?? Infinity)
    - (effectiveDiscoveryOrder(b) ?? Infinity);
  return discovery || artifactKey(a).localeCompare(artifactKey(b));
}

function compareContributions(a: TokenContribution, b: TokenContribution): number {
  const order = (a.order ?? Infinity) - (b.order ?? Infinity);
  return order || a.id.localeCompare(b.id);
}

function copyArtifact(artifact: StylesheetArtifact): StylesheetArtifact {
  return {
    ...artifact,
    diagnostics: artifact.diagnostics?.map((diagnostic) => ({ ...diagnostic })),
  };
}

function copyToken(entry: TokenEntry): TokenEntry {
  return { ...entry };
}

function copyDefinition(definition: TokenDefinition): TokenDefinition {
  return {
    ...definition,
    declarations: definition.declarations.map((declaration) => ({
      ...declaration,
      context: {
        ...declaration.context,
        wrappers: declaration.context.wrappers?.map((wrapper) => ({ ...wrapper })),
      },
    })),
  };
}

function copyContribution(contribution: TokenContribution): TokenContribution {
  return {
    ...contribution,
    tokens: contribution.tokens?.map(copyToken),
    definitions: contribution.definitions?.map(copyDefinition),
    relabellings: contribution.relabellings?.map((relabelling) => ({ ...relabelling })),
    diagnostics: contribution.diagnostics?.map((diagnostic) => ({ ...diagnostic })),
  };
}

function sameObservationFacts(observation: StoredObservation, artifact: StylesheetArtifact): boolean {
  return JSON.stringify(observation.artifact) === JSON.stringify(artifact);
}

function sameContributionFacts(a: TokenContribution, b: TokenContribution): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseObservation(artifact: StylesheetArtifact): StoredObservation {
  const storedArtifact = copyArtifact(artifact);
  const parsed = artifact.content === undefined
    ? { definitions: [], diagnostics: [] }
    : parseStylesheetArtifact(storedArtifact);
  const adapterDiagnostics: InventoryDiagnostic[] = (artifact.diagnostics ?? []).map(
    (diagnostic) => ({ ...diagnostic, artifact: artifact.id }),
  );
  return {
    artifact: storedArtifact,
    contribution: {
      definitions: parsed.definitions,
      diagnostics: [...adapterDiagnostics, ...parsed.diagnostics],
    },
  };
}

function orderEvidence(entries: readonly StoredArtifact[]): ReadonlyMap<string, InventoryOrderEvidence> {
  const discoveryEntries = entries.filter((entry) => effectiveOrder(entry) === undefined);
  const explicit = discoveryEntries.flatMap((entry) => {
    const value = effectiveDiscoveryOrder(entry);
    return value === undefined ? [] : [value];
  });
  let next = explicit.length > 0 ? Math.max(...explicit) + 1 : 0;
  const result = new Map<string, InventoryOrderEvidence>();
  for (const entry of entries) {
    const artifact = effectiveObservation(entry)?.artifact;
    if (!artifact) continue;
    const order = effectiveOrder(entry);
    result.set(artifactKey(entry), order !== undefined
      ? { kind: "stylesheet", index: order }
      : { kind: "discovery", index: effectiveDiscoveryOrder(entry) ?? next++ });
  }
  return result;
}

/** Preserve an authored declaration id when the transform retains its position. */
function reconciledDeclarationId(
  authored: StoredObservation | undefined,
  cssName: string,
  declaration: TokenDefinition["declarations"][number],
): string | undefined {
  const authoredDefinition = authored?.contribution.definitions.find(
    (definition) => definition.cssName === cssName,
  );
  const match = authoredDefinition?.declarations.find((candidate) =>
    candidate.order === declaration.order
    && candidate.source === declaration.source
    && JSON.stringify(candidate.context) === JSON.stringify(declaration.context));
  return match?.id ?? declaration.id;
}

function reconcileObservations(entry: StoredArtifact): Array<{
  definition: TokenDefinition;
  artifact: StylesheetArtifact;
}> {
  const authored = entry.authored;
  const facts = effectiveObservation(entry);
  if (!facts) return [];
  const authoredNames = new Set(
    authored?.contribution.definitions.map((definition) => definition.cssName) ?? [],
  );
  return facts.contribution.definitions.map((definition) => {
    const transformOnly = authored !== undefined && !authoredNames.has(definition.cssName);
    // Project compilers own transform-only names, but package ownership is
    // stronger provenance and survives compilation.
    const origin = transformOnly && facts.artifact.provenance !== "package"
      ? "generated"
      : facts.artifact.provenance;
    const adapter = facts.artifact.adapter ?? authored?.artifact.adapter;
    const base: TokenDefinition = {
      ...definition,
      origin,
      declarations: definition.declarations.map((declaration) => ({
        ...declaration,
        id: facts.artifact.stage === "transformed"
          ? reconciledDeclarationId(authored, definition.cssName, declaration)
          : declaration.id,
      })),
    };
    if (origin === "package" || origin === "generated") base.editable = false;
    if (adapter && origin !== "package") base.adapter = adapter;
    return { definition: base, artifact: facts.artifact };
  });
}

function adapterDeclaration(
  entry: TokenEntry,
  contributionId: string,
  contributionOrder: number,
  order: number,
): InventoryTokenDeclaration {
  const key = entry.cssName ?? entry.name;
  return {
    id: `adapter\x00${contributionId}\x00${key}\x00${entry.source}`,
    order,
    value: entry.value,
    source: entry.source,
    important: false,
    context: {},
    contribution: {
      kind: "adapter",
      id: contributionId,
      provenance: entry.origin,
      editable: entry.editable,
      order: contributionOrder,
    },
  };
}

function setLiteralToken(
  merged: Map<string, MutableDefinition>,
  entry: TokenEntry,
  contributionId: string,
  contributionOrder: number,
  order: number,
): void {
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
    declarations: [adapterDeclaration(entry, contributionId, contributionOrder, order)],
  });
}

/** FNV-1a 32-bit fingerprint. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

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
        `d\x00${declaration.id ?? ""}\x00${declaration.order}`
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
  apply(artifact: StylesheetArtifact): void;
  snapshot(): InventorySnapshot;
  applyContribution(contribution: TokenContribution): void;
  removeContribution(id: string): void;
}

export function createTokenInventory(): TokenInventory {
  const artifacts = new Map<string, StoredArtifact>();
  const contributions = new Map<string, TokenContribution>();
  let snapshotCache: InventorySnapshot | null = null;

  const invalidate = (): void => { snapshotCache = null; };

  function apply(artifact: StylesheetArtifact): void {
    const key = artifactKey(artifact);
    const hasDiagnostics = (artifact.diagnostics?.length ?? 0) > 0;
    if (artifact.content === undefined && !artifact.failed && !hasDiagnostics) {
      if (artifacts.delete(key)) invalidate();
      return;
    }

    const entry = artifacts.get(key) ?? { buildTool: artifact.buildTool, id: artifact.id };
    if (artifact.failed) {
      if (artifact.stage !== "transformed" || entry.transformFailed === true) return;
      entry.transformFailed = true;
      artifacts.set(key, entry);
      invalidate();
      return;
    }

    const observation = parseObservation(artifact);
    const current = artifact.stage === "authored" ? entry.authored : entry.transformed;
    if (current && sameObservationFacts(current, observation.artifact)
      && !(artifact.stage === "transformed" && entry.transformFailed)) return;
    if (artifact.stage === "authored") entry.authored = observation;
    else {
      entry.transformed = observation;
      entry.transformFailed = false;
    }
    artifacts.set(key, entry);
    invalidate();
  }

  function applyContribution(contribution: TokenContribution): void {
    const copied = copyContribution(contribution);
    const existing = contributions.get(copied.id);
    if (existing && sameContributionFacts(existing, copied)) return;
    contributions.set(copied.id, copied);
    invalidate();
  }

  function removeContribution(id: string): void {
    if (contributions.delete(id)) invalidate();
  }

  function snapshot(): InventorySnapshot {
    if (snapshotCache) return snapshotCache;
    const sortedArtifacts = [...artifacts.values()].sort(compareArtifacts);
    const sortedContributions = [...contributions.values()].sort(compareContributions);
    const evidence = orderEvidence(sortedArtifacts);
    const merged = new Map<string, MutableDefinition>();
    let provisionalOrder = 0;

    for (const entry of sortedArtifacts) {
      const rows = reconcileObservations(entry)
        .flatMap(({ definition, artifact }) => definition.declarations.map(
          (declaration) => ({ definition, declaration, artifact }),
        ))
        .sort((a, b) => (a.declaration.order ?? 0) - (b.declaration.order ?? 0));
      for (const { definition, declaration, artifact } of rows) {
        const enriched: InventoryTokenDeclaration = {
          ...declaration,
          order: provisionalOrder++,
          contribution: {
            kind: "stylesheet",
            buildTool: artifact.buildTool,
            id: artifact.id,
            stage: artifact.stage,
            provenance: definition.origin ?? artifact.provenance,
            editable: definition.editable ?? artifact.provenance !== "package",
            orderEvidence: evidence.get(artifactKey(artifact))!,
          },
        };
        const existing = merged.get(definition.cssName);
        if (existing) existing.declarations.push(enriched);
        else {
          const { declarations: _declarations, ...base } = definition;
          merged.set(definition.cssName, { base, declarations: [enriched] });
        }
      }
    }

    for (const [contributionIndex, contribution] of sortedContributions.entries()) {
      const contributionOrder = contribution.order ?? contributionIndex;
      const tokens = [...(contribution.tokens ?? [])]
        .sort((a, b) => (a.cssName ?? a.name).localeCompare(b.cssName ?? b.name));
      for (const token of tokens) {
        setLiteralToken(merged, token, contribution.id, contributionOrder, provisionalOrder++);
      }

      for (const relabelling of contribution.relabellings ?? []) {
        for (const entry of merged.values()) {
          if (entry.base.adapter !== relabelling.adapter
            || entry.base.origin !== relabelling.fromOrigin) continue;
          entry.base = {
            ...entry.base,
            origin: relabelling.origin ?? entry.base.origin,
            editable: relabelling.editable ?? entry.base.editable,
          };
        }
      }

      // Definition-level enrichment by cssName: contributed declarations
      // append, `name`/`adapter` win, and
      // `origin`/`editable` are applied only when the stylesheet-derived
      // definition has none. Unmatched entries are ignored (a contract
      // variable absent from active CSS adds no row).
      for (const definition of contribution.definitions ?? []) {
        const existing = merged.get(definition.cssName);
        if (!existing) continue;
        for (const declaration of definition.declarations) {
          existing.declarations.push({
            ...declaration,
            order: provisionalOrder++,
            contribution: {
              kind: "adapter",
              id: contribution.id,
              provenance: definition.origin,
              editable: definition.editable,
              order: contributionOrder,
            },
          });
        }
        existing.base = {
          ...existing.base,
          name: definition.name,
          adapter: definition.adapter ?? existing.base.adapter,
          origin: existing.base.origin ?? definition.origin,
          editable: existing.base.editable ?? definition.editable,
        };
      }
    }

    const allDeclarations = [...merged.values()]
      .flatMap((entry) => entry.declarations)
      .sort((a, b) => a.order - b.order);
    const compactOrder = new Map(allDeclarations.map((declaration, index) => [declaration, index]));
    const definitions: InventoryTokenDefinition[] = [...merged.values()].map(({ base, declarations }) => ({
      ...base,
      declarations: declarations.map((declaration) => ({
        ...declaration,
        order: compactOrder.get(declaration)!,
      })),
    }));
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
    for (const entry of sortedArtifacts) {
      const facts = effectiveObservation(entry);
      if (facts) diagnostics.push(...facts.contribution.diagnostics);
      if (entry.transformFailed) {
        diagnostics.push({
          code: "transform-observation-failed",
          artifact: entry.id,
          message: `The transformed observation for "${entry.id}" is unavailable or failed; `
            + "the last valid authored observation is retained.",
        });
      }
    }
    for (const contribution of sortedContributions) {
      diagnostics.push(...(contribution.diagnostics ?? []));
    }

    snapshotCache = deepFreeze({
      generation: `g${fnv1a(canonicalSnapshotFacts(definitions, diagnostics))}`,
      definitions,
      tokens,
      diagnostics,
    });
    return snapshotCache;
  }

  return { apply, snapshot, applyContribution, removeContribution };
}
