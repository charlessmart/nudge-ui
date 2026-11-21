# ADR-0053: Editable inline styles with source provenance

Date: 2026-11-21
Status: Proposed
Supersedes: ADR-0036 only where it says managed declarations are never
`!important` and that inline-style conflicts remain reported conflicts

## Context

Edits preview through the managed stylesheet (ADR-0003), and ADR-0036 raises
each managed selector until it ties the strongest page rule. Specificity cannot
beat a `style` attribute, so a preview of a property the element sets inline
would change nothing on screen. `inlineAuthoredValue` therefore blocks every
such field ("This is set as inline style. Can't be edited here.").

On CSS-first hosts that is rare. On the Expo host (ADR-0052) it is the common
case. react-native-web compiles only `StyleSheet.create` objects to classes;
every plain object reaching a `style` prop, whether a literal, an object inside
an array next to sheet styles, or the return value of a `Pressable` style
function, becomes inline. Idiomatic React Native puts static layout in
`StyleSheet.create` and everything that varies at runtime in plain objects:

- theme colours from a hook, such as `[styles.text, { color: colors.text }]`;
- measured sizes, such as `{ width, height }` from `useWindowDimensions`;
- press states, such as `({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })`;
- data-driven values, such as `` { width: `${pct * 100}%` } ``.

In the first Expo app inspected, almost every colour is inline, so the colour
fields are blocked on most elements. Libraries (lists, navigation, safe-area
views) add inline styles of their own.

Inline values are not all the same kind of thing. A literal in source can be
edited and handed to an agent like any other value. An expression in source,
such as `colors.text`, can be edited, but the agent must decide whether the
change belongs to this element or to the value behind the expression. A value
written at runtime by a library, a layout measurement or an animation has no
source to change. Blocking all three loses the first two; unblocking all three
invites edits that no source change can produce.

## Decision

### Provenance from the compiler

The React compiler records how each element's `style` prop is authored, next to
the authored prop kinds it already records for `cprops`. It emits a `cstyle`
identity entry, in `dataSet` on React Native primitives and as `data-cstyle` on
DOM elements, that maps each style property to one of:

- `literal`, with its source text, for a member of an object literal whose
  value is a string, number or template with no expressions;
- `expression`, with its source text, for any other member of an object
  literal, and for every member of an object guarded by a condition
  (`cond && { … }`, ternaries);
- `opaque`, with the source text of the whole prop, when the `style` prop or
  an array entry is an identifier, call, spread or function, so its properties
  are unknown.

Object literals are read directly and through arrays at any depth. Members
that reference `StyleSheet.create` entries are not recorded, because they
compile to classes and never reach the `style` attribute. Keys are normalised
to the CSS longhands they set (camelCase to kebab-case, and React Native
shorthands such as `paddingHorizontal` to both longhands), so the inspector
matches them against computed properties.

### Field states

For a property that the selected element sets inline:

- **Literal or expression in source**: the field is editable.
- **Opaque in source**: the field is editable, and the prompt quotes the prop.
- **No `cstyle` entry for the property, or no provenance on the element**: the
  value was written at runtime. The field stays blocked, and the message says
  so: "Set at runtime, not in this element's source."

Hosts that do not emit `cstyle` keep today's behaviour: every inline-authored
property is blocked.

### Preview

An edit to an editable inline property records its source on the change
(`inlineSource`), read from the element when the edit is made. The managed
stylesheet stays a pure function of the change log: a declaration from a change
with an inline source is projected with `!important`. Every other declaration
keeps ADR-0036's specificity boost and stays normal.

The scope is one property on one source site, which the inline style already
controls. Page `:hover` and `:focus` rules for that property already lose to
the inline style, so nothing is overridden that was not overridden before. An
interaction-state edit to an inline property takes `!important` inside its
state selector, so it shows only in that state. A CSS animation of the same
property, which would beat the inline style, is overridden while the edit is
active.

The inspector still never writes the element's `style` attribute (ADR-0003),
and canvas renderers receive the flag in the serialised CSS.

### Change records and prompt

An element change on an inline property stores its provenance (`literal`,
`expression` or `opaque`, with source text). The prompt states where the value
lives:

- literal: change `paddingHorizontal: 4` on the element's `style` prop;
- expression: the element reads `colors.text`; the agent decides whether to
  change the value behind it, use a different one, or override this element,
  and must not hard-code over a shared value without saying so;
- opaque: the property comes from `style={…}` (quoted), which the agent must
  trace before editing.

The React Native paragraph from ADR-0052 still asks for React Native styles.

## Consequences

- On Expo, colours, spacing and other values passed as plain objects become
  editable. Most of these are the theme expressions that the prompt now names,
  so edits are steered toward the theme rather than toward per-element
  overrides.
- Measured, animated and library-written values stay blocked, with a message
  that says why.
- `!important` appears in managed rules for the first time outside token
  changes. Because it is decided when the edit is made, an element that stops
  writing the property inline later, through hot reload for example, keeps the
  `!important` preview until the edit is made again.
- A literal that the app later replaces at runtime, for example through a
  ref, previews correctly but has a source the agent cannot find by its value
  alone; the prompt's quoted source text and location still point at the site.
- Identity grows by one entry on elements with a `style` prop. Elements
  without one are unchanged.
- Astro, static HTML and other hosts without compiler provenance gain nothing
  until they emit `cstyle`; their authored `style` attributes are literal by
  construction and can follow later.

## Verification

- Compiler tests cover literal, expression, conditional and opaque members,
  arrays, `StyleSheet` references being skipped, React Native and camelCase
  key normalisation, `Pressable` style functions, and DOM elements gaining
  `data-cstyle` while components do not.
- Inspector tests cover the field states, opaque attribution, and hosts
  without provenance keeping the current block.
- Edit tests cover recording the inline source and projecting `!important`
  for that declaration only; codec tests cover saving it.
- Prompt tests cover the literal, expression and opaque wording, with and
  without the React Native paragraph.
- An Expo end-to-end check on `rider` edits a theme colour passed as
  `{ color: colors.text }` and a literal `paddingHorizontal`, and confirms a
  measured `{ width, height }` stays blocked.
