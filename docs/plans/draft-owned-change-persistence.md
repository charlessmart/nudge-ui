# Draft-owned change persistence

Status: Implemented on `codex/draft-version-history`.

See [ADR-0033](../adr/0033-draft-persistence-and-study-transactions.md) for the
accepted decision and its verification requirements.

Each draft has one canonical in-memory change set and an explicit application or
HTML target. The draft store serializes those records only for persistence. Session schema 16 stores layout and
handoff metadata. Startup activates the restored draft before projecting edits;
the former session-to-draft adoption heuristic is removed. Draft activation
preserves the unified session undo timeline, including canvas creation commands.
Demo drafts remains in memory, and project draft writes obey the workspace lease.

Study edits persist as draft intent until handoff. The study module materializes
and commits a revision-checked HTML capture before agent dispatch, then settles
only the saved draft revision. External refresh uses the same operation queue.
