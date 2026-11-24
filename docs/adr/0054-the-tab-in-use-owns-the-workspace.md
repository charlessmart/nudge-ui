# ADR-0054: The tab in use owns the workspace

Date: 2026-11-24
Status: Proposed

## Context

A project's drafts, Canvas session, and comments are each saved as one stored
value per project, and autosave rewrites the whole value. Two tabs writing it
would each overwrite the other's work, so one tab holds a workspace lease
(renewed every 5 seconds, expiring after 15), and writes check it. ADR-0030
relies on this: a tab that takes over re-reads storage before it writes.

Until now a tab that found a live lease showed a "Nudge is open in another
tab" notice with a "Take over here" button. People routinely have the same
app open in more than one tab, and coding agents open it again in their own
preview browsers, so the notice appeared constantly and every switch between
tabs took an extra click.

## Decision

The tab the person is using owns the workspace. Nothing is shown in a tab
that does not.

- The lease records whether its owner is in use (visible and focused). The
  owner updates this on focus, blur, and visibility changes and on every
  heartbeat.
- On load, a tab takes a live lease only when its owner is not in use and the
  new tab is. Otherwise it stays inactive: the inspector is not mounted and
  the inspector host carries `data-nudge-workspace="inactive"`.
- An inactive tab takes the lease when the person comes back to it: the
  window gains focus, it becomes visible while focused, or it receives a
  pointer or key press. Takeover goes through the existing path, which
  re-reads storage before mounting.
- A tab that loses the lease disposes its controller and tears down the
  inspector without a notice, then waits for the same signals.
- The owner flushes its pending autosave as soon as it is hidden or loses
  focus, so the next tab reads its latest changes.
- The only remaining notice is for storage that cannot be read. It offers
  "Try again" and does not take over on focus, so a failing store is not
  retried on every interaction.

Only intent signals transfer ownership after load. Two documents that both
report focus, as Playwright pages do, therefore cannot pass the lease back and
forth on their own.

## Consequences

- Switching between tabs on the same project needs no click. The inactive tab
  rebuilds the inspector when it takes over, so selection and in-progress
  interactions in the old tab are dropped, as before.
- An agent's preview page that is interacted with takes the workspace; the
  person's tab takes it back on their next focus, click, or key press.
- Edits made in the last moments before a switch reach the new tab because
  the old owner flushes on blur. Extension storage is asynchronous, so a
  write still in flight when the new tab reads can be missed, as it could be
  with the button.
- Tests and embedders detect an inactive tab by the host attribute instead of
  the notice, and take over by focusing the tab.
