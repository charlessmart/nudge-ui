import type { InventoryDiagnostic, TokenContribution } from "@nudge-ui/css/token-inventory";
import type { TokenEntry } from "../virtual/design-tokens.ts";
import type { TokenAdapter, TokenMapping } from "./types.ts";

export function createTokenAdapterRegistry(adapters: TokenAdapter[]) {
  function extractDetectedTokens(): TokenEntry[] {
    return adapters
      .filter((adapter) => adapter.detect())
      .flatMap((adapter) => adapter.extractTokens());
  }

  return {
    detect(): TokenAdapter[] { return adapters.filter((adapter) => adapter.detect()); },
    extractTokens(): TokenEntry[] { return extractDetectedTokens(); },
    toInventoryContribution(diagnostics: InventoryDiagnostic[] = []): TokenContribution {
      return {
        id: "adapter-registry",
        order: -1,
        tokens: extractDetectedTokens(),
        diagnostics,
      };
    },
    resolveClassName(className: string): TokenMapping | null {
      for (const adapter of adapters) {
        if (!adapter.detect() || !adapter.resolveClassName) continue;
        const mapping = adapter.resolveClassName(className);
        if (mapping) return mapping;
      }
      return null;
    },
  };
}
