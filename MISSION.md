# Mission: Understand and extend the Design Tool styling pipeline

## Why

Build enough codebase fluency to confidently trace a CSS value from authored source through CSSOM and the browser cascade into the inspector UI, then reason about how Tailwind, Sprinkles, and future framework adapters fit into that pipeline.

## Success looks like

- Explain the difference between authored, token-resolved, and computed CSS values using this repository's code.
- Trace a selected property through the runtime resolver, UI field, managed stylesheet, and preview verification.
- Add or debug a conformance fixture for a new CSS value or styling-system behavior.
- Predict which parts are universal CSS behavior and which parts require a styling or framework adapter.

## Constraints

- Teach from the existing repository and its current Vite-first, React-first scope.
- Assume solid CSS rules and shorthand knowledge; introduce Tailwind v3/v4 and Sprinkles incrementally.
- Prefer short lessons with retrieval practice and concrete file traces.

## Out of scope

- Implementing Vue or Svelte support now.
- Claiming universal editing support for every valid CSS grammar.
