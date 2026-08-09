# 0049 — Durable rendered-instance CSS overrides

**Labels:** enhancement, needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop reliability

## Parent

- `docs/features/durable-rendered-instance-projection.md`

## User story

As a designer selecting one repeated item, I can choose **Edit this rendered
item only**, change a CSS value, and see that individual override survive
refresh, Inspect/Canvas switching, and Canvas frame reload without changing
the other outputs of the same JSX source site.

## What to build

Replace the runtime-only `instance-preview` path with a controller-owned,
durable rendered-instance CSS override. Capture a `RenderedInstanceRef` from
the selected element and resolve it independently in the host and each Canvas
document. The resolver must return one match, missing, or ambiguous; it must
not silently broaden to a source-site edit.

Use a dev-only, per-document projection marker to target the resolved element
from the managed stylesheet. The marker is derived from the canonical override
ID and is not stored as canonical identity. Keep source-site CSS as the
default; individual CSS overrides are emitted after source-site rules and
removed by **Relink to source**.

## Acceptance criteria

- [x] Repeated source-site output shows **Edit this rendered item only**;
      source-site CSS remains the default.
- [x] An individual colour, spacing, or typography override affects one item
      in Inspect and the corresponding item in every ready Canvas frame.
- [x] The individual override survives host refresh, Canvas mode switching,
      and Canvas frame reload through durable session restoration.
- [x] A missing or ambiguous instance is reported and left unapplied; it never
      changes a different item or broadens to all source-site matches.
- [x] Relinking removes the individual override and restores source-site
      editing behaviour.
- [x] The managed stylesheet remains the only CSS projection mechanism; no
      tracked host element receives an inline style (ADR-0003).
- [x] Unit tests cover capture, resolution, source-versus-instance rule
      precedence, relink, and missing/ambiguous outcomes.
- [x] Playwright covers a repeated Sandbox item edited individually in Inspect,
      Canvas, after host refresh, and after Canvas frame reload.
- [x] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites, and
      `pnpm --filter sandbox build` pass with dev-only gating held.

## Out of scope

- Delete and move projection (0050 and 0051).
- Bulk structural actions.
- Application-key identity adapters (0054).

## Blocked by

None — can start immediately.
