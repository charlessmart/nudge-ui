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
- **Flow**: An agent-written journey through the app, stored as a project file in
  `nudge/flows`. It lists states and the edges between them.
- **Flow state**: One screen of a flow and its recipe: a route, plus seeded
  storage, mocked network and replayable steps as needed. A frame showing a state
  is still a live route, and edits go to that page's draft.
- **Scenario**: The part of a recipe installed before the app's first script. It
  applies to one frame and blocks writes it does not mock.
- **Session undo**: One ordered timeline of edits and frame creation. Replaying
  an entry focuses its owning frame, including when another draft is active.
- **Styling dialect**: A way of writing styles that changes how tokens are named
  and applied: Tailwind v3, Tailwind v4 or vanilla-extract. Plain CSS is the
  absence of a dialect. A dialect is detected per project and tells the prompt
  how an edit should be written.

A future **saved version** must represent an immutable captured state with its
own identity. Mutable draft revisions do not provide that guarantee.
