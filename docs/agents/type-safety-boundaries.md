# Type safety boundaries

Use this guide when resolving anti-slop findings involving `unknown`, broad
dictionaries, or type assertions. The goal is not to eliminate the word
`unknown`; it is to keep uncertainty at explicit runtime boundaries and expose
precise owner contracts everywhere else.

## Classification

Before editing a finding, classify the value.

### Owned structure

If this repository creates and controls the value, describe that structure in
its owner contract. Do not cast each consumer to a locally invented shape.

Typical fixes:

- augment `Window` once for a dev-only browser seam;
- return a named object or tuple when length and roles are stable;
- give callbacks `void` or a real result type instead of ignored `unknown`;
- use a named interface for shared state;
- use `satisfies` when checking a known object without widening its inferred
  keys or literal values.

An optional owned property means “not initialized yet”; it should not mean “the
initialized value has an unknown shape.” Prefer:

```ts
declare global {
  interface Window {
    __designTokens?: readonly TokenEntry[];
  }
}
```

over either a repeated cast or an `unknown`-valued global declaration.

### Untrusted input

Network payloads, persisted browser state, user configuration, messages, and
parsed source data enter as `unknown`. A decoder or type guard must validate the
representation and return a named domain type:

```ts
export function parseSession(value: unknown): Session | null {
  if (!isRecord(value)) return null;
  if (typeof value.version !== "number") return null;
  // Validate the remaining fields before constructing Session.
  return buildSession(value);
}
```

`unknown`, `Record<string, unknown>`, and runtime representation checks are
allowed inside this boundary. They should not leak into the domain API that
calls it. Never silence a finding by replacing `unknown` with `any`, `object`,
`{}`, or an unchecked generic.

### Opaque third-party runtime

Babel ASTs, Vite hooks, React internals, CSSOM cross-realm values, and similar
APIs may have incomplete, version-sensitive, or deliberately opaque types.
Keep their access inside an adapter:

1. Prefer a stable upstream type when it accurately represents the supported
   versions.
2. Otherwise define one local raw boundary type and checked field readers.
3. Validate discriminants before reading variant-specific fields.
4. Return repository-owned types from the adapter.
5. Do not spread local casts throughout callers.

Boundary modules should live under a recognizable `boundaries/`, `adapters/`,
or decoder path so Oxlint overrides can review them as warnings without
weakening ordinary domain code.

### Tests

Tests should use production contracts wherever possible. If a test repeatedly
casts an owned function result, improve the production return type or expose a
typed test seam. For third-party hook unions, write one runtime narrowing helper
instead of repeating `as unknown as`.

Tests are excluded from the safety-comment rule because comments that merely
describe test intent do not establish runtime safety. Chained assertions remain
visible as warnings for cleanup.

## Assertions that remain

Use a single assertion only when TypeScript cannot express an invariant that is
established elsewhere. Put the evidence immediately before it:

```ts
// SAFETY: Babel reports `node.type === "Identifier"` only for nodes with a
// string `name`; the discriminant was checked above.
const identifier = node as BabelIdentifier;
```

A useful comment names both the invariant and its evidence. These are not
useful:

```ts
// SAFETY: needed for TypeScript.
// SAFETY: the test checks this below.
// SAFETY: this should be a Foo.
```

Never use `as unknown as T`. The chained-assertion rule owns that finding and a
SAFETY comment does not make it acceptable. Improve the owner contract, decode
the value, or isolate the third-party boundary.

## Bulk remediation order

1. Separate test findings from production findings.
2. Mark genuine boundary modules and move scattered integration access behind
   them when practical.
3. Fix owned contracts first; these changes often remove many downstream casts.
4. Add or improve decoders for genuinely untrusted values.
5. Replace `unknown` returns with `void`, a named result, or a parsed domain
   value.
6. Replace known-value widening with inference plus `satisfies`.
7. Review remaining standalone assertions and document only real invariants.
8. Run unit tests, Oxlint, ESLint, typecheck, and the production build contract.

Do not mechanically make the lint count fall. A successful migration reduces
the number of places that know about dynamic representations while preserving
runtime checks at the places that must know about them.
