# Issue tracker: local Markdown

Active implementation issues live as numbered Markdown files in `docs/issues/`.
Completed issue records may be moved to `docs/issues/archive/` as historical
evidence; archived records are not candidates for new work.

## Conventions

- One active issue per `docs/issues/NNNN-slug.md` file.
- Preserve the original number and slug when moving a completed issue to
  `docs/issues/archive/`.
- Continue the repository-wide zero-padded number sequence.
- Include `Labels`, `Type`, and `Milestone` near the top of every new issue.
- Record dependencies in a `## Blocked by` section using local issue numbers.
- Keep completed acceptance criteria checked in the issue file.

## Publishing an issue

When a skill says to publish an issue, create its Markdown file under
`docs/issues/`; do not create a GitHub issue unless the user explicitly asks.
