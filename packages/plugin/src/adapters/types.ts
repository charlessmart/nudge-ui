import type { TokenEntry } from "../virtual/design-tokens.ts";

export interface TokenMapping {
  className: string;
  token: TokenEntry | null;
  property?: string;
  confidence: "exact" | "probable" | "unknown";
  diagnostic?: string;
}

export interface TokenAdapter {
  name: string;
  detect(): boolean;
  extractTokens(): TokenEntry[];
  resolveClassName?(className: string): TokenMapping | null;
}
