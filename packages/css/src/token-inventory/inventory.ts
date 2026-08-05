/**
 * The token inventory engine.
 *
 * Aggregates stylesheet artifacts and Adapter-contributed literal tokens into
 * deterministic, immutable snapshots. It never reads the filesystem, invokes
 * Vite, resolves modules, executes user configuration, loads runtime
 * documents, or serializes a virtual module — those are Adapter
 * responsibilities (Stage 2 plan, "Responsibilities behind the seam").
 */
import type { TokenDefinition, TokenDeclaration, TokenEntry } from "../model/index.ts";
import { parseStylesheetArtifact } from "./parseStylesheet.ts";
import type { InventoryDiagnostic, InventorySnapshot, StylesheetArtifact } from "./types.ts";

interface StoredRow {
  readonly artifact: StylesheetArtifact;
  readonly contribution: ReturnType<typeof parseStylesheetArtifact>;
}

/** Stable artifact rank: supplied `order` wins, otherwise discovery by id. */
function artifactRank(artifact: StylesheetArtifact): [number, string] {
  return [artifact.order ?? Infinity, artifact.id];
}

function compareArtifacts(a: StylesheetArtifact, b: StylesheetArtifact): number {
  const [ao, ai] = artifactRank(a);
  const [bo, bi] = artifactRank(b);
  return ao - bo || ai.localeCompare(bi);
}

function sameArtifactFacts(a: StylesheetArtifact, b: StylesheetArtifact): boolean {
  return a.buildTool === b.buildTool
    && a.id === b.id
    && a.stage === b.stage
    && a.provenance === b.provenance
    && a.order === b.order
    && a.content === b.content;
}

function sameTokenEntries(a: readonly TokenEntry[], b: readonly TokenEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, i) => JSON.stringify(entry) === JSON.stringify(b[i]));
}

/** FNV-1a 32-bit hash; a small pure-JS fingerprint with no Node dependency. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Canonical serialization of the observable inventory facts. Only these facts
 * feed the generation fingerprint, so generation changes exactly when they do.
 */
function canonicalSnapshotFacts(
  definitions: readonly TokenDefinition[],
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
        ` \x00${declaration.id ?? ""}\x00${String(declaration.order ?? "")}`
        + `\x00${declaration.value}\x00${declaration.source}\x00${String(declaration.important)}`
        + `\x00${JSON.stringify(declaration.context)}`,
      );
    }
  }
  for (const diagnostic of diagnostics) {
    parts.push(`X\x00${diagnostic.code}\x00${diagnostic.artifact}\x00${diagnostic.message}`);
  }
  return parts.join("\n");
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

export interface TokenInventory {
  /** Create, update, or remove rows for one artifact. */
  apply(artifact: StylesheetArtifact): void;
  /** Immutable snapshot with deterministic order and generation. */
  snapshot(): InventorySnapshot;
  /** Merge literal tokens contributed by styling Adapters. */
  setAdapterTokens(tokens: readonly TokenEntry[]): void;
}

export function createTokenInventory(): TokenInventory {
  const rows = new Map<string, StoredRow>();
  let adapterTokens: readonly TokenEntry[] = [];
  let snapshotCache: InventorySnapshot | null = null;

  function invalidate(): void {
    snapshotCache = null;
  }

  function apply(artifact: StylesheetArtifact): void {
    const { id, content } = artifact;
    if (content === undefined) {
      if (rows.delete(id)) invalidate();
      return;
    }
    const existing = rows.get(id);
    if (existing && sameArtifactFacts(existing.artifact, artifact)) return;
    rows.set(id, { artifact, contribution: parseStylesheetArtifact(artifact) });
    invalidate();
  }

  function setAdapterTokens(tokens: readonly TokenEntry[]): void {
    if (sameTokenEntries(adapterTokens, tokens)) return;
    adapterTokens = tokens;
    invalidate();
  }

  function snapshot(): InventorySnapshot {
    if (snapshotCache) return snapshotCache;

    const sortedRows = [...rows.values()].sort((a, b) => compareArtifacts(a.artifact, b.artifact));

    // Group by cssName in artifact order; later artifacts append declarations.
    // Definition-level provenance/editability come from the FIRST declaring
    // artifact (legacy `load()` parity: the first file wins). Package artifacts
    // are non-editable; every other provenance is editable by default.
    const merged = new Map<string, { base: TokenDefinition; declarations: TokenDeclaration[] }>();
    for (const { artifact, contribution } of sortedRows) {
      for (const definition of contribution.definitions) {
        const existing = merged.get(definition.cssName);
        if (existing) {
          existing.declarations.push(...definition.declarations);
        } else {
          const base: TokenDefinition = {
            ...definition,
            origin: artifact.provenance,
          };
          if (artifact.provenance === "package") base.editable = false;
          merged.set(definition.cssName, { base, declarations: [...definition.declarations] });
        }
      }
    }

    // Adapter literal tokens merge last, replacing any stylesheet definition
    // with the same key (legacy `load()` parity for Tailwind v3 config tokens).
    const sortedAdapterTokens = [...adapterTokens]
      .sort((a, b) => (a.cssName ?? a.name).localeCompare(b.cssName ?? b.name));
    for (const entry of sortedAdapterTokens) {
      const key = entry.cssName ?? entry.name;
      merged.set(key, {
        base: {
          cssName: key,
          name: entry.name,
          cssValue: entry.cssValue,
          adapter: entry.adapter,
          origin: entry.origin,
          editable: entry.editable,
          declarations: [],
        },
        declarations: [{
          id: `adapter\x00${key}\x00${entry.source}\x00${entry.value}`,
          value: entry.value,
          source: entry.source,
          important: false,
          context: {},
        }],
      });
    }

    // Global positional order across every declaration; deterministic given
    // the same facts because artifact rows are sorted before merging.
    let order = 0;
    const definitions: TokenDefinition[] = [];
    for (const { base, declarations } of merged.values()) {
      definitions.push({
        ...base,
        declarations: declarations.map((declaration) => ({ ...declaration, order: order++ })),
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

    const generation = `g${fnv1a(canonicalSnapshotFacts(definitions, diagnostics))}`;
    snapshotCache = deepFreeze({
      generation,
      definitions,
      tokens,
      diagnostics,
    });
    return snapshotCache;
  }

  return { apply, snapshot, setAdapterTokens };
}
