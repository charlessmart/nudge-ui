# Nudge domain model

Nudge is a development-only visual inspector. It previews edit intent and hands
that intent to a coding agent. The inspector does not edit application source.

- **Frame**: A positioned, sized view on the canvas. Several frames can show the
  same content with different viewports.
- **Live route**: An application page rendered by its development server. Edits
  are handed to the agent for implementation in application source.
- **HTML iteration**: An independent, project-local HTML document captured from a
  frame. Its source URL records provenance; its own document is the edit target.
- **Draft**: Mutable pending edit intent for one page URL or HTML iteration. Live
  frames of the same page share a draft;
  different pages and iterations have independent drafts. A draft revision identifies intent for
  consistency checks, rather than a saved historical version.
- **Frame group**: An agent-owned collection of pages on the canvas. Frames
  move and resize independently; membership does not determine edit ownership.
- **Session undo**: One ordered timeline of edits and frame creation. Replaying
  an entry focuses its owning frame, including when another draft is active.
- **Agent activity**: Temporary attribution of file reads or edits to rendered
  source identities. Activity does not change task status or edit intent.

A future **saved version** must represent an immutable captured state with its
own identity. Mutable draft revisions do not provide that guarantee.
