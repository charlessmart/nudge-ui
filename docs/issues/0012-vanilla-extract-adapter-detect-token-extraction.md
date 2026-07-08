# 12 — vanilla-extract adapter: detect + token extraction

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 3 — vanilla-extract adapter

## What to build

Implement the `TokenAdapter` interface from PLAN.md and the first concrete adapter — vanilla-extract / sprinkles:

```ts
interface TokenAdapter {
  name: string;                    // "vanilla-extract" | "tailwind-v3" | etc.
  detect(): boolean;               // "is this project using this framework?"
  extractTokens(): TokenEntry[];   // contribute rows to the token table
  resolveClassName?(cls: string): TokenMapping | null;
}
```

For vanilla-extract:
- `detect()` checks whether the project imports from `@vanilla-extract/sprinkles` / `@vanilla-extract/css`
- `extractTokens()` imports theme contract objects and walks the tree to build a `humanName → var(--hashed-name)` map (e.g. `theme.color.brand` → `--color-brand__1g5vs1s0`)
- Enriches the token table from #3 with human-readable names, so the token panel shows `theme.color.brand` instead of the hashed CSS var

## Acceptance criteria

- [ ] `TokenAdapter` interface defined and exported from the package
- [ ] vanilla-extract adapter's `detect()` returns true when the project uses `@vanilla-extract/css` or `@vanilla-extract/sprinkles`
- [ ] `extractTokens()` imports theme contract objects and walks the tree to produce `{ humanName, varName, value, source }` entries
- [ ] Adapter enriches the token table so the runtime sees `theme.color.brand` mapped to its hashed CSS var
- [ ] Adapter registry allows the universal parser (#3) and adapters to coexist (adapter rows merge into the table; non-adapter projects still get the universal table)
- [ ] When vanilla-extract is not present, the adapter no-ops cleanly (no crash, no spurious tokens)
- [ ] Token table updates on HMR when vanilla-extract theme files change

## Blocked by

- #3 — Token table parser + virtual module