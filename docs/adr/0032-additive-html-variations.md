# ADR-0032: Additive HTML variations

Date: 2026-10-02
Status: Accepted
Supersedes: ADR-0031

## Decision

The plus control adds a linked live frame. Variation captures the source frame
into a new independent HTML artifact and leaves the source and its linked group
in place. Button-created variations appear below the group; Command/Ctrl-drag
on a frame's top bar places a variation at the drop position. The drag preview
shows the destination without moving the source.

Variations retain the project-local storage, responsive capture, artifact prompt
handoff, and external document refresh behavior described in ADR-0031. Independent
HTML studies can also serve as the source of further variations. Refresh polling
must not interrupt an active inline text edit.
