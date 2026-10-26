# ADR-0040: Sketches are recent copied images

Date: 2026-10-23
Status: Accepted
Supersedes: ADR-0030's sketch-ownership rules, and the sketch-storage notes in
ADR-0033 as retained by ADR-0037.

## Context

The sketch tool now draws over the live frame and copies one marked-up PNG. A
saved sketch exists so a copy that was never pasted can be copied again; it is
not a draft-owned, editable artifact and it is not sent to an agent. The older
model still carried draft ownership, handoff and queue state, annotations,
notes, strokes, capture metadata, a separate original image, revisions, and
filenames. None of that has a reader in the current UI, and it costs storage and
makes the persisted shape describe a workflow the product no longer has.

## Decision

- A saved sketch is the copied PNG, not an editable document.
- Each project keeps `SKETCH_LIMITS.keptSketches` records. A record stores the
  schema version, project ID, sketch ID, creation and update times, the source
  page URL, the image dimensions, and the PNG. Nothing else is persisted.
- Draft ownership, handoff and delivery state, annotations, notes, strokes,
  capture metadata, the original screenshot, revisions, and filenames are
  removed.
- The IndexedDB database is version 2. Opening it drops the v1 `handoffs` store.
  Extension storage keeps only `sketch:<origin>|doc:<id>`; v1 records fail the
  new schema and are discarded during hydration.
- Copying to the clipboard does not depend on storage. Persisting a sketch for
  the recent-sketch stack remains best effort.

## Consequences

- Each sketch stores one image instead of two and no dispatch rows, so the small
  recent-sketch budget goes further.
- A saved sketch can be copied again or removed, but not reopened, edited, or
  re-sent. Old sketches are dropped once when the schema version changes; this
  is deliberate because the data has no remaining consumer.
- The MCP sketch attachment protocol remains for compatibility with older
  clients, but the current UI does not send sketches. Removing that protocol
  surface is a separate decision.
