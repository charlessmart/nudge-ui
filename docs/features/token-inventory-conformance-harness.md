# Token inventory and CSS-value conformance harness

## Purpose

Make token inspection and editing trustworthy across ordinary CSS, popular CSS
tooling, and future framework adapters. The harness is not a compatibility
claim for all of CSS; it is the executable product contract for which values
the inspector can identify, explain, and edit faithfully.

## Product contract

For a selected property, the inspector must keep four facts separate:

1. **Authored value** — the declaration the author wrote.
2. **Token attribution** — the project or framework token(s) referenced by
   that declaration, including aliases and local implementation variables.
3. **Computed value** — the value the browser paints after cascade and
   function evaluation.
4. **Edit capability** — whether the current UI can faithfully edit the value.

Computed values are evidence and previews. They must never replace authored
values in an editable field: doing so would turn `rem`, `calc()`, aliases, and
Tailwind color utilities into opaque pixels or sRGB strings.

Each resolved value should therefore carry the following conceptual model:

```ts
type InspectedValue = {
  authored: string;
  computed: string;
  tokens: Array<{ name: string; origin: "project" | "framework" | "generated" | "runtime" }>;
  modifiers: Array<{ kind: "alpha" | "fallback" | "expression"; value: string }>;
  confidence: "exact" | "probable" | "unknown";
  capability: "atomic" | "color" | "box-sides" | "structured" | "composite" | "raw";
};
```

This is a model contract, not a commitment to expose that exact TypeScript
shape publicly in the first implementation.

## Editing policy

The inspector should only offer structured controls when it can preserve the
authored meaning:

| Capability | Initial examples | Editing behavior |
| --- | --- | --- |
| `atomic` | `var(--space-4)`, `16px`, `600` | Existing token/raw field. |
| `color` | token plus alpha, `rgb()`, `oklch()` | Token chip and color/alpha controls; show painted preview. |
| `box-sides` | margin, padding, inset | Per-side controls with linked or independent editing. |
| `structured` | simple border, flex | Dedicated fields only after a faithful grammar exists. |
| `composite` | gradient, shadow, transform, background | Readable raw value and computed preview; no misleading decomposition. |
| `raw` | unsupported or ambiguous CSS | Raw CSS escape hatch only. |

Examples of deliberately deferred structured editors are `background`,
`font`, `transition`, `animation`, arbitrary transform chains, and multi-shadow
lists. They remain inspectable and editable as raw CSS. Grid has a separately
proposed raw-field slice in `docs/features/grid-layout-controls.md`; it does
not introduce a visual track or area builder without further conformance work.

## Tool and framework scope

The token engine and rendered-element identity vary independently.

### Styling adapters

| Priority | Styling system | Why it is distinct |
| --- | --- | --- |
| 1 | Standard CSS | Shared token and value semantics that every later adapter consumes. |
| 2 | Tailwind v4 | `@theme`, generated CSS variables, `color-mix()`, and local `--tw-*` composition. |
| 3 | Tailwind v3 | JavaScript config and generated utilities frequently differ from v4's theme-variable model. |
| 4 | vanilla-extract / Sprinkles | Project tokens originate in TypeScript theme contracts and atomic classes. |
| Deferred | CSS Modules | Normal CSS semantics, but module/source mapping and hashed-selector support need a separate readiness decision. |
| Later | Runtime CSS-in-JS, Panda, UnoCSS | Runtime injection or alternative compilation contracts require a separate product decision. |

### Framework adapters

React, Vue, and Svelte share CSS-value semantics but differ in how host
elements are instrumented and how source locations/scoped styles are emitted.
Framework support should be tested separately from styling support. Do not
create the full framework × styling-system matrix initially:

1. Prove each styling adapter in one React/Vite fixture.
2. Prove each framework adapter with ordinary CSS.
3. Add a cross-product fixture only where compiler behavior changes, such as
   Vue + Tailwind v4 or Svelte + CSS Modules.

Vite-only and React-first remain the current product scope until a new ADR
changes that decision. The fixture structure is intentionally prepared for
future adapters without claiming them now.

## Harness architecture

The harness is one deep module with a small interface: a fixture provides
inputs and expectations; the harness returns a catalog, inspected values, and
managed-preview results. Tool-specific compilation belongs behind adapters,
not in individual test bodies.

```text
fixture source/config
        │
        ├── static catalog test ──► token inventory
        ├── Vite build/dev test ──► transformed stylesheet artifact
        └── browser test ─────────► selected element + computed style
                                      │
                                      └── catalog / attribution / preview assertions
```

Fixtures are intentionally small and data-led:

```text
test-fixtures/
  token-conformance/
    plain-css/aliases-and-fallbacks/
    plain-css/functions-and-units/
    plain-css/box-shorthands/
    tailwind-v4/colors-and-alpha/
    tailwind-v3/config-and-opacity/
    css-modules/token-consumers/
    sprinkles/theme-contract/
```

Each fixture contains only the source required to reproduce a behavior,
marked selectable elements, and expectations for catalog entries and inspected
properties. Generated build output is tested as an artifact rather than
committed as a brittle snapshot unless the fixture explicitly needs a small
golden CSS assertion.

## Test layers

### 1. Pure inventory and value tests

Fast Vitest cases for token catalog parsing, token-reference graphs, value
classification, and shorthand decomposition. These cases do not start Vite or
a browser.

Initial corpus:

- `var()` aliases, fallbacks, and cycles.
- `calc()`, `min()`, `max()`, and `clamp()` with token references.
- colors in hex, `rgb`, `hsl`, `oklch`, `currentColor`, transparent, and
  token-plus-alpha expressions.
- margin/padding/inset and simple border shorthands.
- logical properties and unitless/relative units.
- explicit unsupported composite values, which must classify as raw rather
  than be decomposed incorrectly.

### 2. Build-tool integration fixtures

Small Vite projects ensure the inventory sees what a styling tool actually
emits. They prove source provenance separately from browser rendering.

Tailwind v4 tests must cover project `@theme` declarations, framework defaults,
`color-mix()` opacity, and `--tw-*` aliases. Tailwind v3 tests must cover
config-derived colors and opacity helpers. Sprinkles tests must connect a
generated class to a human-readable contract path.

### 3. Browser conformance fixtures

Playwright selects marked elements and asserts, independently:

1. the catalog/token origin;
2. the authored token/modifier attribution;
3. the browser's computed value;
4. the inspector capability/confidence;
5. where supported, managed stylesheet preview, change log, and prompt output.

This prevents a parser from passing by merely producing a plausible string
that does not match the rendered result.

## Initial conformance cases

| Case | Primary assertion |
| --- | --- |
| Root token + alias | Names and resolved leaf value remain distinct. |
| Token fallback | `var(--x, fallback)` retains both reference and fallback. |
| Theme/layer/media winner | Active declaration follows the host context. |
| Arithmetic function | Referenced token is found without flattening expression. |
| Tailwind v4 alpha utility | Base color token and alpha modifier survive computed serialization. |
| Tailwind local alias | `--tw-*` implementation variable resolves to its global leaf token. |
| Tailwind v3 opacity utility | Config token and opacity helper resolve together. |
| Simple border shorthand | Width, style, and color are independently attributed. |
| Border fallback | Ambiguous/composite form remains raw. |
| Logical spacing | Block/inline values map without silently inventing physical sides. |
| CSS Module consumer | Hashed selector remains attributable to a project token. |
| Sprinkles consumer | Atomic class reports its theme-contract token path. |

## Milestone sequence

1. Establish the shared fixture runner, the authored-versus-computed assertion
   model, and the ordinary-CSS baseline corpus.
2. Deliver Tailwind v4 color alpha attribution as the first adapter-backed
   behavior.
3. Add value classification and simple border decomposition with raw fallback.
4. Add Tailwind v3 as a separate adapter-backed fixture set.
5. Integrate the vanilla-extract/Sprinkles contract work already planned in
   issues 0012 and 0013 into the conformance runner.
6. Add CSS Modules and, later, framework adapter fixtures only when those
   adapters enter product scope.

## Non-goals

- Claiming universal editing support for all valid CSS.
- Replacing authored expressions with browser-computed values.
- Building every complex property editor before its value model is proven.
- Supporting non-Vite build tools or non-React frameworks in the current
  milestone without an explicit product/ADR decision.
