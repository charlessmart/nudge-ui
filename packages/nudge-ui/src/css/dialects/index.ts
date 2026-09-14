import type { TokenCatalogDiagnostic, TokenEntry } from "../model/index.ts";
import type { InventoryDiagnostic, TokenContribution } from "../token-inventory/types.ts";
import { isTailwindV3Config, readTailwindV3Config, tailwindV4Relabelling } from "./tailwind.ts";
import { readThemeContract } from "./vanillaExtract.ts";

export * from "./tailwind.ts";
export * from "./vanillaExtract.ts";

/**
 * Host-neutral interpretation of CSS dialects.
 *
 * Hosts differ enormously in what they can see. A Vite host watches the whole
 * transform pipeline; a static-file host only reads `.css` off disk. That
 * difference is real and this module does not paper over it: a host supplies
 * the evidence it can actually observe, and `interpretDialects` turns exactly
 * that evidence into token knowledge.
 *
 * The consequence worth relying on is that the function is pure. Two hosts
 * supplying the same evidence get the same tokens, so dialect behaviour can be
 * tested here, once, without standing up a build tool. Where a host observes
 * less, it reports less — see `DialectObservation` — rather than silently
 * producing a thinner catalog that looks the same as a complete one.
 */

export type DialectName = "tailwind-v3" | "tailwind-v4" | "vanilla-extract";

/** A Tailwind v3 config object the host resolved. */
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

/**
 * A theme contract loaded from a published module.
 *
 * `attempted` distinguishes "the host never looked" from "the host looked and
 * found nothing", which are different facts: only the second should clear a
 * contract the inventory already holds.
 */
export interface PublishedThemeContractEvidence {
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
  /** Failures the host hit while gathering the evidence above. */
  readonly diagnostics?: readonly InventoryDiagnostic[];
}

/** What one dialect contributed, and on the strength of what evidence. */
export interface DialectObservation {
  readonly dialect: DialectName;
  readonly evidence: "none" | "config" | "contract" | "css";
  /** Tokens or definitions this dialect contributed. */
  readonly tokenCount: number;
}

export interface DialectInterpretation {
  /** Apply all of these to the token inventory, in this order. */
  readonly contributions: readonly TokenContribution[];
  /** What the supplied evidence proved, for host capability reporting. */
  readonly observed: readonly DialectObservation[];
}

/**
 * Every contribution is emitted on every call, empty when a dialect has no
 * evidence. Contributions are id-keyed and replaceable, so an omitted one would
 * leave stale facts in the inventory instead of clearing them.
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
    // v4 tokens are already in the CSS the parser read; this dialect relabels
    // them rather than contributing rows of its own.
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
 * A published contract contributes identity only. The emitted CSS remains the
 * authority on value, cascade context, and editability, so entries arrive as
 * definitions with no declarations and the inventory merges them by CSS name.
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
