# ADR-0048: Styling dialect adapters

Date: 2026-11-03
Status: Accepted

## Context

Nudge supports plain CSS, Tailwind v3, Tailwind v4 and vanilla-extract. The
`css/dialects` module turns evidence a host observed into token contributions
(`interpretDialects`). It owns nothing else about a dialect, and only the Vite
host calls it:

- Next.js and static HTML scan stylesheets without it, so a Tailwind v4 project
  on those hosts publishes plain custom properties and reports
  "CSS custom properties".
- Tailwind v4 is recognised by two different patterns. The shared one also
  matches `--tw-*`, which Tailwind v3 emits too.
- The inspector branches on `token.adapter` strings for token origin, literal
  colour matching, Tailwind's `--tw-*` plumbing, vanilla-extract declaration
  hydration and Tailwind v4 opacity utilities.
- The handoff prompt receives the styling system and never reads it, so an
  agent is told a token by name, such as `theme.colors.brand.500`, without being
  told that it is applied with a utility class.

## Decision

**A dialect is one `StylingDialect` value in `css/dialects`.** Each of Tailwind
v3, Tailwind v4 and vanilla-extract has one, listed in `STYLING_DIALECTS` in
priority order. Plain CSS is the absence of a dialect. A dialect answers:

- whether an authored stylesheet uses it;
- the origin its tokens default to, whether its tokens are literals rather
  than custom properties, and whether its token declarations must be read back
  from the page;
- which custom properties are its internal plumbing;
- what a class that applies a token means, such as `bg-brand/40`;
- how its source writes a token for a property, such as `bg-brand`.

The module stays free of runtime imports, so the hosts and the browser use the
same answers. Token interpretation remains `interpretDialects(evidence)`; its
contribution ids and order are unchanged.

**Every host reports the dialects in use.** The runtime configuration gains
`stylingDialects`, and `stylingSystem` becomes a label derived from it. Vite and
Astro derive the list from stylesheet detection and token adapters. The shared
project token snapshot used by Next.js and static HTML detects dialects in the
stylesheets it scans, labels Tailwind v4 stylesheets, and applies the Tailwind
v4 relabelling, so all four hosts publish the same facts for the same CSS.
Tailwind v4 is detected by `@import "tailwindcss"` or `@theme` only.

**Consumers ask the dialect, not the adapter string.** Inspector code that
needs dialect behaviour looks the token's dialect up with `stylingDialect()`.

**The prompt names the token's source form.** A token edit whose dialect can
name the source form adds it, for example "In Tailwind this is the
`bg-sunken` utility". The source form is phrased as a fact, because the change
record does not prove the element is styled with utilities rather than with
CSS that reads the same variable.

## Consequences

- A new dialect is one `StylingDialect` and its evidence, and reaches every
  host, the inspector and the prompt without new branches.
- Next.js and static HTML still cannot read a Tailwind v3 configuration or a
  vanilla-extract contract. They detect Tailwind v3 from `@tailwind` directives,
  which gives the label but no tokens.
- Utility names follow Tailwind's documented namespaces. A project that
  renames a namespace or adds a prefix gets a wrong suggestion, which the
  prompt presents as a fact about Tailwind rather than an instruction.
- Variant-level guidance for `cva()` and `tv()` needs the component contract to
  record where a variant's classes are written. That is a separate decision.

## Verification

- `css/dialects` unit tests cover detection, utility naming, class readings and
  the unchanged token contributions.
- Project token snapshot tests cover Tailwind v4 detection and relabelling
  without Vite.
- Prompt tests cover source forms.
