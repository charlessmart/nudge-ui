# 0015 — Token resolution must account for CSS specificity

**Status:** needs-triage

**Blocked by:** none

---

## User story

As a designer editing a Tailwind-styled component in the inspector, I see the
wrong token in the token panel. For example, `text-primary` sets
`color: var(--color-primary)` on the element, but the inspector shows
`--color-sidebar-ring` instead because a lower-specificity global rule
(`* { color: var(--color-sidebar-ring) }`) happens to appear later in the
stylesheet.

The computed visual color is correct (the browser handles the cascade), but
the token resolver picks the wrong token because it uses last-match-wins
ignoring specificity.

---

## Problem

The current `resolvePropertiesFromRules` function in `resolution.ts:84-109`
walks all CSS rules matching the element and builds a `Map<property, value>`
using `Map.set()`. Each call to `set` overwrites any previous rule for the
same property — the **last** matching rule in stylesheet order wins,
regardless of its selector specificity.

```ts
for (const rule of rules) {
  if (!el.matches(rule.selectorText)) continue;
  for (const decl of rule.declarations) {
    map.set(decl.property, <ResolvedProperty>);
  }
}
```

This means:
- `.text-primary { color: var(--color-primary) }` (spec 0,1,0)
- `* { color: var(--color-sidebar-ring) }` (spec 0,0,0)

If `*` appears **after** `.text-primary` in the stylesheet, the resolver shows
`--color-sidebar-ring` even though the browser computes `--color-primary`.

The same bug affects the ancestor-inheritance fallback path
(`getResolvedProperties:174-203`) which also walks rules without specificity.

---

## Implementation outline

### 1. Add a CSS specificity calculator

A pure function that parses a `selectorText` string and returns a numeric
tuple `[inline, id, class, element]` (or a single numeric score for easy
comparison, e.g. `a * 1000000 + b * 10000 + c * 100 + d`).

Handle:
- ID selectors (`#foo`)
- Class selectors (`.foo`)
- Attribute selectors (`[data-x]`)
- Pseudo-classes (`:hover`, `:nth-child(n)`)
- Pseudo-elements (`::before`)
- Element type selectors (`div`, `*`)
- `:not()`, `:is()`, `:where()` — these take the specificity of their
  arguments, except `:where()` which adds nothing
- Multiple comma-separated selectors (`a, b`) — use the highest specificity
  among them

### 2. Carry specificity alongside each MatchedRule

Add a `specificity: number` field to `MatchedRule` and compute it in
`collectRules()` when creating each rule. This avoids re-parsing selectors
on every resolution cycle.

### 3. Sort by specificity before resolving

In `resolvePropertiesFromRules()`, process rules in specificity order
(highest first) so that `Map.set()` implicitly picks the highest-specificity
rule per property, with stylesheet order as tiebreaker.

### 4. Same fix for the ancestor-walk path

The `getResolvedProperties()` ancestor loop at lines 174-203 also iterates
rules without specificity ordering. Apply the same fix.

---

## Tests

### Unit (Vitest) — add to `resolution.test.ts`

- `CSS specificity: .foo beats *` — two rules target the same element with
  the same property; the lower-specificity rule appears second; resolver
  picks the higher-specificity token
- `CSS specificity: #id beats .foo` — ID vs class ordering
- `CSS specificity: equal specificity uses stylesheet order` — two rules
  with same specificity; the later one wins
- `CSS specificity: comma-separated selectors use max specificity` —
  `div, .foo { ... }` should be treated as `.foo`-level specificity
- `CSS specificity: ::before and :hover are counted` — pseudo-class = class
  level, pseudo-element = element level
- `CSS specificity: :where() adds zero` — `:where(.foo) div` has element
  specificity only
- `CSS specificity: ancestor walk respects specificity` — inheritance path
  also picks highest-specificity rule

---

## Acceptance criteria

- [x] Token resolver picks the correct token when a higher-specificity rule
      (e.g. `.text-primary`) competes with a lower-specificity global rule
      (e.g. `*`)
- [x] Ancestor token inheritance also respects specificity
- [x] Comma-separated selectors use the max specificity of any part
- [x] `:where()` does not contribute specificity
- [x] Equal-specificity rules use stylesheet order as tiebreaker
- [x] `pnpm lint`, `pnpm typecheck`, and all existing tests pass
