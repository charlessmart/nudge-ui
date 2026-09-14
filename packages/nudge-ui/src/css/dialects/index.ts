import type { TokenCatalogDiagnostic, TokenEntry } from "../model/index.ts";
import type { InventoryDiagnostic, TokenContribution } from "../token-inventory/types.ts";
import { isTailwindV3Config, readTailwindV3Config, tailwindV4Relabelling } from "./tailwind.ts";
import { readThemeContract } from "./vanillaExtract.ts";

export * from "./tailwind.ts";
export * from "./vanillaExtract.ts";

/**
 * Host-neutral interpretation of CSS dialects. Hosts see very different things
 * — a Vite host watches the whole transform pipeline, a static-file host only
 * reads `.css` off disk — so each supplies the evidence it can observe and this
 * module turns exactly that into token knowledge. It is pure, so the same
 * evidence yields the same tokens on every host and dialect behaviour can be
 * tested without a build tool. A host that observes less reports less through
 * `DialectObservation` rather than quietly producing a thinner catalog.
 */

export type DialectName = "tailwind-v3" | "tailwind-v4" | "vanilla-extract";

export interface TailwindV3Evidence {
  readonly config: unknown;
  /** Path recorded on the resulting tokens. */
  readonly source?: string;
}

/** A theme contract written inline in host configuration. */
export interface InlineThemeContractEvidence {
  readonly contract: unknown;
  /** Compiled values by custom-property name, when the host observed the CSS. */
  readonly cssValues?: Readonly<Record<string, string>>;
  readonly source?: string;
}

/** A theme contract loaded from a published module. */
export interface PublishedThemeContractEvidence {
  /** Separates "never looked" from "looked and found nothing"; only the latter clears a held contract. */
  readonly attempted: boolean;
  readonly contract: unknown;
  /** Whether the contract came from a dependency rather than project source. */
  readonly fromPackage?: boolean;
  readonly prefix?: string;
  readonly source?: string;
  readonly diagnostics?: readonly TokenCatalogDiagnostic[];
}

/** Everything a host managed to observe about the project's dialects. */
export interface DialectEvidence {
  readonly tailwindV3?: TailwindV3Evidence;
  /** True when any observed stylesheet carried Tailwind v4 markers. */
  readonly tailwindV4Css?: boolean;
  readonly inlineThemeContract?: InlineThemeContractEvidence;
  readonly publishedThemeContract?: PublishedThemeContractEvidence;
  readonly diagnostics?: readonly InventoryDiagnostic[];
}

export interface DialectObservation {
  readonly dialect: DialectName;
  readonly evidence: "none" | "config" | "contract" | "css";
  readonly tokenCount: number;
}

export interface DialectInterpretation {
  /** Apply to the token inventory in this order. */
  readonly contributions: readonly TokenContribution[];
  readonly observed: readonly DialectObservation[];
}

/**
 * Every contribution is emitted on every call, empty when a dialect has no
 * evidence: they are id-keyed and replaceable, so omitting one would leave
 * stale facts in the inventory rather than clearing them.
 */
export function interpretDialects(evidence: DialectEvidence = {}): DialectInterpretation {
  const observed: DialectObservation[] = [];

  const tailwindV3Tokens = readTailwindV3Evidence(evidence.tailwindV3);
  observed.push({
    dialect: "tailwind-v3",
    evidence: evidence.tailwindV3 === undefined ? "none" : "config",
    tokenCount: tailwindV3Tokens.length,
  });

  const inlineTokens = readInlineContract(evidence.inlineThemeContract);

  const contributions: TokenContribution[] = [{
    id: "dialect-tokens",
    order: -1,
    tokens: [...tailwindV3Tokens, ...inlineTokens],
    diagnostics: [...(evidence.diagnostics ?? [])],
  }];

  const tailwindV4 = evidence.tailwindV4Css === true;
  contributions.push(tailwindV4 ? tailwindV4Relabelling() : { id: "tailwind-v4-naming", order: 0 });
  observed.push({
    dialect: "tailwind-v4",
    evidence: tailwindV4 ? "css" : "none",
    // v4 tokens are already in the parsed CSS; this dialect only relabels them.
    tokenCount: 0,
  });

  const published = readPublishedContract(evidence.publishedThemeContract);
  contributions.push(published.contribution);
  observed.push({
    dialect: "vanilla-extract",
    evidence: inlineTokens.length + published.count > 0 ? "contract" : "none",
    tokenCount: inlineTokens.length + published.count,
  });

  return { contributions, observed };
}

function readTailwindV3Evidence(evidence: TailwindV3Evidence | undefined): TokenEntry[] {
  if (evidence === undefined || !isTailwindV3Config(evidence.config)) return [];
  return readTailwindV3Config(evidence.config, evidence.source);
}

function readInlineContract(evidence: InlineThemeContractEvidence | undefined): TokenEntry[] {
  if (evidence === undefined) return [];
  return readThemeContract(evidence.contract, {
    source: evidence.source ?? "theme-contract.ts",
    origin: "project",
    editable: true,
    ...(evidence.cssValues === undefined ? {} : { cssValues: evidence.cssValues }),
  });
}

/**
 * Contributes identity only: the emitted CSS stays authoritative on value,
 * cascade, and editability, so entries carry no declarations and merge by CSS name.
 */
function readPublishedContract(
  evidence: PublishedThemeContractEvidence | undefined,
): { contribution: TokenContribution; count: number } {
  const empty: TokenContribution = { id: "vanilla-extract-contract", order: 1 };
  if (evidence === undefined || !evidence.attempted) return { contribution: empty, count: 0 };

  const diagnostics = evidence.diagnostics ?? [];
  if (diagnostics.length > 0) {
    return {
      contribution: {
        ...empty,
        diagnostics: diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          artifact: diagnostic.module,
          message: diagnostic.message,
          ...(diagnostic.exportName === undefined ? {} : { exportName: diagnostic.exportName }),
        })),
      },
      count: 0,
    };
  }

  if (evidence.contract === null || evidence.contract === undefined) {
    return { contribution: empty, count: 0 };
  }

  const entries = readThemeContract(evidence.contract, {
    ...(evidence.prefix === undefined ? {} : { prefix: evidence.prefix }),
    source: evidence.source ?? "theme-contract",
    origin: evidence.fromPackage === true ? "package" : "project",
    editable: false,
  });

  return {
    contribution: {
      ...empty,
      definitions: entries.map((entry) => ({
        cssName: entry.cssName ?? entry.name,
        name: entry.name,
        adapter: entry.adapter,
        origin: entry.origin,
        editable: entry.editable,
        declarations: [],
      })),
    },
    count: entries.length,
  };
}
