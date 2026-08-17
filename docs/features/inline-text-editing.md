# Inline text editing

**Status:** Approved

## Purpose

Let a designer double-click visible page copy, edit it in place with native
caret and selection behaviour, preview the result, and include source-aware
text intent in the canonical change set and agent prompt.

The interaction has one user-facing shape but two commit paths:

1. a confidently matched component text prop such as `label`, `text`, or
   primitive `children` commits through the framework runtime Adapter; and
2. direct or unresolved rendered copy commits as a canonical `text-content`
   change projected by document Adapters.

`document.designMode` is not used. It makes the complete application document
editable and conflicts with the inspector's selection, navigation, drag, and
keyboard authority. Editing is scoped to one temporary native editing host.

## User model

- Double-click visible text to edit it in place.
- Enter commits a single-line edit, Escape cancels, and blur commits.
- One editing session creates one undo entry, not one entry per keystroke.
- The editor displays the resolved binding, for example `Button.label`,
  `Heading.children`, or `Rendered text`.
- If more than one semantic binding is equally plausible, the user chooses
  from an inline binding chooser.
- The Changes Log and copied prompt preserve component/source authorship and
  rendered-instance evidence.

## Terms and invariants

An **inline editing host** is the temporary DOM surface that supplies native
caret, selection, spellcheck, paste, and IME behaviour. It is never canonical
identity and is removed on commit or cancel.

A **text binding** explains what authored concept produced the rendered text:

```ts
type TextEditBinding =
  | { kind: "component-prop"; property: string; target: ComponentChangeTarget }
  | { kind: "rendered-text"; target: TextProjectionTarget };
```

The component binding is preferred only when a known text contract has one
runtime string value that matches the edited rendered text. Otherwise the
framework-neutral rendered-text fallback is used when it can be resolved
conservatively.

The feature retains these project invariants:

- all instrumentation, editing markers, runtime behaviour, and protocol data
  are dev-only under ADR-0002;
- text intent never becomes CSS or an inline style under ADR-0003;
- component text props rerender through the framework Adapter under ADR-0007;
- the Canvas controller owns canonical intent and renderers only apply and
  report projections under ADR-0006; and
- every prompt includes a `data-cid`/`data-src` source fallback.

## Binding resolution

Inline targeting starts from the deepest text under the pointer rather than
the normal logical selection target. The selected logical component may be a
`Button`, while the native editing host is a nested label span.

Component contracts gain a `text` control. Project contracts recognise string
props and supported React `children`/`ReactNode` contracts when the current
runtime value is a string. Package manifests may explicitly mark visible-text
props. Runtime matching excludes structural and implementation props such as
`id`, `className`, `href`, `src`, `role`, `style`, `data-*`, and `aria-*`.

Candidates whose current string equals the edited rendered text are ranked by
the known visible-text names `children`, `label`, `text`, `caption`,
`description`, and `title`. One confident match is automatic; multiple equal
matches require an inline chooser. The JSX transform records `children`
authorship as `literal`, `expression`, or `spread/default` just as it already
does for attributes.

## Native editing session

The smallest safe rendered host temporarily receives
`contenteditable="plaintext-only"` and a dev-only editing marker. For an
interactive or complex host, only the target text node may be wrapped in a
temporary editable span. The wrapper is unwrapped without becoming identity.

While editing, selection capture, dragging, structural actions, navigation,
and Design Tool history shortcuts stand down. `beforeinput` restricts the
initial feature to plain insertion, replacement, deletion, and composition.
Enter commits, rich formatting is rejected, paste becomes plain text, and an
operation whose target range leaves the editing host is rejected. Original
`contenteditable`, `spellcheck`, DOM structure, and selection are restored.

The browser mutation is a draft only. On semantic commit, the temporary host
is removed before the component change is appended so the real framework
Adapter owns the permanent preview. On rendered-text commit, the document
projection adopts the edited node and attaches its own local marker.

## Repeated component invocations

The current React override is keyed by component callsite. A callsite inside a
map can render several instances, so overriding `label` by callsite would edit
all of them.

The React runtime Adapter reports the mounted count for a callsite:

- a unique callsite uses the semantic component-prop projection;
- a repeated literal invocation may explicitly offer a source-site/all-output
  change but never assumes it;
- a repeated expression or spread defaults to a rendered-instance text change
  whose prompt tells the agent to update the corresponding data/source logic;
  and
- an instance without confident durable evidence is reported ambiguous rather
  than being projected onto a different item.

## Rendered-text change and identity

```ts
interface TextContentChangeRecord {
  kind: "text-content";
  id: string;
  target: TextProjectionTarget;
  source: { file: string; line: number; column: number; component: string };
  selector: string;
  before: string;
  after: string;
  authoredAs: "literal" | "expression" | "unknown";
}

interface TextProjectionTarget {
  sourceSite: SourceSiteRef;
  occurrence: number;
  props: string | null;
  ariaLabel: string | null;
  beforeText: string;
}
```

The general rendered-instance resolver currently includes visible text as
identity evidence. A text edit therefore cannot use its post-apply validation
unchanged: the edit would invalidate its own target.

The text projection owns a separate document-local
`data-dt-projection-text=<change-id>` marker and follows this policy:

1. Capture source identity and original text before editing.
2. Retain the actual node only for the transient editing session.
3. In a new document, match source identity and stable evidence, accepting
   either `before` or `after` text, and require exactly one candidate.
4. Never use occurrence alone to choose between identical repeated items.
5. After application, validate the connected marked element, source identity,
   and `after` text; do not re-resolve it against `beforeText`.
6. If reconciliation removes the marker or changes the text, report
   `overridden` and retain canonical prompt intent without a reapply loop.
7. Undo/clear restores `before` only when the marked element still contains
   the projected `after`, so newer application state is never overwritten.

A future stable application-key Adapter takes precedence over text evidence.

## Architecture

One deep inline-text Module owns binding resolution, session lifecycle, input
policy, canonical commit, and cancellation behind a small interface:

```ts
interface InlineTextEditor {
  begin(element: HTMLElement, point: { x: number; y: number }):
    | InlineTextSession
    | TextEditRejection;
}

interface InlineTextSession {
  binding: TextEditBinding;
  commit(): ChangeRecord | null;
  cancel(): void;
}
```

React and the framework-neutral DOM fallback are two real Adapters at the
binding seam. Future Vue or Svelte Adapters can provide semantic text bindings
without changing the editor interaction or canonical rendered-text record.

Host and Canvas documents are two Adapters at the projection seam. The
controller sends one revisioned workspace projection containing CSS,
component overrides, rendered-instance markers, structural changes, and text
changes. Renderers apply it and report `applied`, `missing`, `ambiguous`, or
`overridden`; they never own text history.

## Prompt handoff

A semantic edit remains a component prop change and preserves literal versus
expression guidance. A rendered-text edit gets its own prompt section with
before/after copy, source site, bounded instance evidence, authorship, and the
selector fallback. Repeated expression guidance says to update the relevant
data item or source logic rather than hardcoding the shared expression.

## Initial exclusions

- Replacing complete `textContent` when that would destroy child markup.
- Form values, placeholders, and accessibility labels.
- Application-owned rich text/contenteditable editors.
- Cross-element selections and rich formatting.
- Guessing between identical repeated instances without a stable key or other
  unique evidence.

## Delivery sequence

| Issue | Deliverable | Depends on |
| --- | --- | --- |
| 0056 | Unique component `label`/primitive `children` inline editing | None |
| 0057 | Durable rendered-text fallback in Inspect and Canvas | 0056 |
| 0058 | Repeated component invocation and ambiguity handling | 0057 |
| 0059 | Nested text, paste/IME, and reconciliation hardening | 0058 |
