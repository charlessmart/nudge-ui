import type { TokenCatalogDiagnostic, TokenEntry } from "../model/index.ts";
import type { InventoryDiagnostic, TokenContribution } from "../token-inventory/types.ts";
import { isTailwindV3Config, readTailwindV3Config, tailwindV4Relabelling } from "./tailwind.ts";
import { readThemeContract } from "./vanillaExtract.ts";

export * from "./tailwind.ts";
export * from "./vanillaExtract.ts";

export type DialectName = "tailwind-v3" | "tailwind-v4" | "vanilla-extract";

export interface TailwindV3Evidence {
  readonly config: unknown;
  readonly source?: string;
}

export interface InlineThemeContractEvidence {
  readonly contract: unknown;
  /** Only when the host observed the emitted CSS. */
  readonly cssValues?: Readonly<Record<string, string>>;
  readonly source?: string;
}

export interface PublishedThemeContractEvidence {
  /** Separates "never looked" from "looked and found nothing"; only the latter clears a held contract. */
  readonly attempted: boolean;
  readonly contract: unknown;
  readonly fromPackage?: boolean;
  readonly prefix?: string;
  readonly source?: string;
  readonly diagnostics?: readonly TokenCatalogDiagnostic[];
}

export interface DialectEvidence {
  readonly tailwindV3?: TailwindV3Evidence;
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

/** Emitted even with no evidence: contributions are id-keyed, so omitting one would leave stale facts. */
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

/** Contributes identity only: the emitted CSS stays authoritative on value and editability. */
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
