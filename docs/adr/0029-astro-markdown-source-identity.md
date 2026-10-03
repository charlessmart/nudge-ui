# ADR-0029: Astro Markdown source identity

Date: 2026-10-03
Status: Accepted
Supersedes: ADR-0011 for Markdown and MDX source identity only.

## Context

Astro's rendered source annotations do not identify ordinary MDX prose.
The response identity pass assigns tag labels but cannot recover original
Markdown coordinates. Text projection therefore rejects these elements.
Structural projection permits missing source coordinates, but inconsistent
normalization during capture and validation incorrectly marks moves as
externally overridden and prevents undo or clear from restoring their order.

## Decision

In development, the Astro integration extends the consumer's Markdown pipeline
with source identity instrumentation. Legacy remark/rehype configuration uses
a rehype plugin. Processor-based configuration extends the supported `unified`
or `satteri` processor's plugin options without replacing that processor.
MDX inherits this instrumentation through its normal Markdown configuration.

Instrument standard prose elements that have original parser positions with
`data-cid` and project-relative `data-src="file:line:column"`. Preserve existing
identity attributes. Leave custom JSX components and nodes without trustworthy
positions unchanged. The response pass continues to identify `.astro` elements
and preserves Markdown identities already present in the HTML.

Keep the text projection identity requirements and ambiguity checks. Normalize
missing identity attributes consistently in rendered-instance capture and
validation. Continue to skip restoration when the application actually changes
a projected element's evidence or placement.

## Consequences

- Supported Markdown and MDX prose uses the existing text projection, canvas
  replay, and prompt source-location paths.
- Identical paragraphs at different authored positions remain distinguishable.
- Inline links and emphasis receive their own identities; existing mixed-text
  editing restrictions remain in effect.
- MDX configurations that opt out of Markdown inheritance or replace its
  processor separately do not receive automatic instrumentation. Custom
  component mappings must forward attributes to their rendered element.
- No compiler plugin is registered when Nudge is disabled or during builds.
  Production output remains free of inspector identities.
