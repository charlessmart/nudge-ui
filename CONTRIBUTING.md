# Contributing

Use the project's external issue tracker for planning; do not add issue records
under `docs/`. Keep pull requests focused, include tests for behavior changes,
and do not commit secrets or generated output.

Before submitting a change, run:

```sh
pnpm test:unit
pnpm typecheck
pnpm lint
```

`pnpm lint:oxlint` is optional and non-gating; use it when checking anti-slop
findings.
