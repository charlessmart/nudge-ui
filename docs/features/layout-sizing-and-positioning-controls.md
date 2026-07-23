# Layout sizing and absolute-positioning controls

## Purpose

Extend the existing **Layout** editor so a designer can size an element and,
when it is absolutely or fixed positioned, place it by an explicit X/Y offset
and choose the physical sides to which that offset is anchored. This is an
extension of completed issue 0014, not a second layout surface.

The work must preserve the current inspector contract:

- read selected values through `getStateStyleValue()` so the selected
  interaction state and managed edits are reflected;
- write every edit through the existing change log and managed
  `#design-tool-styles` stylesheet, never an inline style;
- use the stable selected-element selector already created by `setStyle()`;
- keep the current `LayoutComboField` custom-value, unit-completion, and
  keyboard-nudging behaviour; and
- retain the dev-only boundary in ADR-0002. No plugin transform or production
  runtime work is needed for this feature.

## User experience

The Layout section keeps its existing order: Display/Position, then the new
**Size** group, then flex controls and position-specific controls.

### Size group

Show Size for every selected element. It contains six compact
`LayoutComboField` controls and one dedicated ratio field:

| Row | CSS properties | Presets | Notes |
| --- | --- | --- | --- |
| Size | `width`, `height` | `auto`, `0`, `100%`, `fit-content` | The primary dimensions. |
| Minimum | `min-width`, `min-height` | `0`, `min-content`, `fit-content` | A missing minimum still displays the browser's computed `0px`; committing a value creates an explicit longhand. |
| Maximum | `max-width`, `max-height` | `none`, `100%`, `100vw` / `100vh`, `fit-content` | `none` remains a keyword, not a zero length. |
| Aspect ratio | `aspect-ratio` | `auto`, `1 / 1`, `4 / 3`, `3 / 2`, `16 / 9`, `21 / 9` | A ratio field accepts any valid authored CSS value, such as `3 / 2`, `auto 16 / 9`, or `var(--media-ratio)`. |

`width`, `height`, all min/max fields, and position offsets share the existing
pixel-length value policy: a bare non-zero number commits as `px`; `0`, CSS
keywords, percentages, functions, variables, and supplied units pass through
unchanged. The max-height field must use height-oriented presets (`100vh`), not
copy the max-width options mechanically.

Aspect ratio is deliberately a raw structured field rather than a numeric
spinner. It should preserve authored slash syntax and not infer a ratio from
the rendered box dimensions, since those dimensions may be determined by
content, min/max constraints, or a parent layout.

### Absolute/fixed position group

For `position: absolute` and `position: fixed`, replace the current generic
Inset-only experience with a **Position** group:

1. A horizontal anchor control exposes **Left**, **Right**, and **Stretch**.
2. A vertical anchor control exposes **Top**, **Bottom**, and **Stretch**.
3. The X field edits the active horizontal offset; the Y field edits the
   active vertical offset.
4. A disclosure labelled **Individual insets** exposes the existing four-side
   `top`/`right`/`bottom`/`left` editors for precise values and inspection.

Anchor is an honest CSS-inset concept, not a synthetic transform feature:

| Axis choice | Active CSS declaration(s) | Inactive declaration(s) |
| --- | --- | --- |
| Left | `left` | `right: auto` |
| Right | `right` | `left: auto` |
| Horizontal stretch | `left`, `right` | none |
| Top | `top` | `bottom: auto` |
| Bottom | `bottom` | `top: auto` |
| Vertical stretch | `top`, `bottom` | none |

Switching from Left to Right (or Top to Bottom) writes the existing offset to
the newly active side and explicitly writes `auto` to the inactive side. That
prevents old opposing insets from silently turning a fixed-size element into a
stretch constraint. Stretch shows the two relevant side values instead of a
misleading single X or Y field.

The editor derives the initial anchor from authored-state inset values:

- one non-`auto` side selects that side;
- two non-`auto` sides select Stretch;
- neither side defaults to Left/Top with an `auto` offset placeholder, but
  makes no edit until the user commits a value; and
- a non-literal value (`var()`, `calc()`, percentage, etc.) is still an active
  anchor value and is preserved as raw CSS.

There is intentionally no **Center** anchor in this slice. Centering requires
coordinating an inset with `transform: translate…`, but transform is a
composite property whose existing authored value cannot be safely rewritten by
this inspector. It remains a future feature behind a faithful transform model.

For `relative` and `sticky`, retain the current four individual inset controls
under **Inset**. For `static`, no position-value controls appear. The anchor
controls must never be offered for static, relative, or sticky layout because
their semantics would imply an absolute-positioning constraint system that CSS
does not provide.

## Implementation design

### Component structure

Keep `LayoutSection.tsx` as the orchestration point. Extract focused child
components beside it rather than adding more unrelated logic to the flex
controls:

```text
styleEditors/
  LayoutSection.tsx             # selection, visibility, ordering
  LayoutComboField.tsx          # reused for length and keyword controls
  AspectRatioField.tsx          # raw ratio input + presets
  PositionAnchorControls.tsx    # anchors, X/Y routing, individual-inset disclosure
  positionAnchor.ts             # pure axis detection and edit-plan helpers
```

`SizeSection` may remain a small local component in `LayoutSection.tsx` until
it gains behaviour independent of those controls. Reuse the existing
`SideValuesField`/`SideControls` visuals for the expanded individual-inset
view; do not create another four-side layout pattern.

### Anchor model and atomic edits

Add a pure `positionAnchor.ts` model with no DOM dependencies. It receives
the four authored-state values and returns a horizontal and vertical mode plus
the values each mode should display. It also builds a declaration plan for an
anchor click. Example:

```ts
type AxisAnchor = "start" | "end" | "stretch" | "none";

type AxisEditPlan = ReadonlyArray<{ property: "left" | "right" | "top" | "bottom"; value: string }>;
```

An anchor change affects two declarations, so it must be one undoable history
operation. Add a narrow `setStyles(el, declarations)` sibling to `setStyle()`
instead of calling `setStyle()` twice. It should construct the same element
change records, preserve the first-edit baseline for each property, and append
the complete declaration set through one batched change-log operation.

Implement the batching capability inside `changesLog.ts` (for example,
`appendChanges(changes)`) rather than coupling `PositionAnchorControls` to the
global history internals. The batch must:

- project all resulting declarations in a single managed-sheet rebuild;
- create one undo/redo history entry;
- preserve per-property records so Change Log, preview verification, canvas
  projection, revert, and prompt generation keep their existing behaviour;
- remove a declaration record when its edited value returns to its recorded
  baseline; and
- notify subscribers once.

The X/Y input itself is a normal single-property `setStyle()` edit. An anchor
switch uses the batch helper only when it changes the active/inactive side
pair. The implementation must not attempt to remove authored CSS declarations:
`auto` is the explicit, reversible CSS value that disables an opposing inset.

### Value and refresh rules

- Extend `valuePolicyFor()` only if a property is missing from its current
  pixel-length set; width, height, min/max dimensions, and physical insets are
  already covered.
- Add `aspect-ratio` as raw policy so `completeCssValue()` never appends `px`
  to `16 / 9` or an authored variable.
- Use `getStateStyleValue()` for dimension, aspect-ratio, and inset reads;
  do not derive values from `getBoundingClientRect()`.
- Give Size and position children the same `layoutRevision` refresh key used
  by the present Layout controls. An edit must update dependent visibility,
  displayed anchor, and input values without reselection.
- Pass the current `tokenRows` only to the individual-inset `TokenField`s as
  today. This slice does not add sizing-token classification or a separate
  token picker; raw values and token references remain valid free-text CSS.

### Inspector styling and accessibility

Add styles to the existing inspector stylesheet conventions in
`InspectorShell.tsx`/`StyleEditor.css` rather than host-page CSS. Anchor
controls should use the existing `Button`, `SegmentedControl`, or compact
control styling, with `aria-pressed` and clear names such as “Anchor
horizontally to right”. X/Y and all size inputs need visible labels; the
visual icon alone is insufficient. Stable `data-test` hooks should describe
intent (`layout-size-width`, `layout-anchor-horizontal-right`,
`layout-position-x`) rather than CSS implementation detail.

## Sandbox and verification plan

Extend the existing Layout lab rather than create a second fixture page. Add
marked elements with deliberately distinct cases:

| Fixture | Initial CSS | Why it exists |
| --- | --- | --- |
| `sizing-box` | width/height, min/max, and `aspect-ratio: 4 / 3` | Proves every Size field reads and writes a managed rule. |
| `right-anchored-box` | absolute, `right`/`bottom` offsets | Proves X/Y map to active end sides. |
| `stretched-box` | absolute, both left/right insets | Proves Stretch exposes two offsets and is inferred correctly. |
| `relative-offset-box` | relative with one inset | Guards the retained generic Inset path. |

### Unit tests (Vitest)

- `positionAnchor.test.ts`: axis inference for start/end/stretch/none,
  keyword and functional values, and plans that write the opposing side to
  `auto`.
- Change-log batch tests: one managed-sheet projection and one undo step for a
  two-property anchor switch; reverting each property and returning to baseline
  still remove records correctly.
- `AspectRatioField.test.tsx`: presets and raw commits preserve `3 / 2`,
  `auto`, and `var(--media-ratio)` without unit completion.
- `LayoutSection.test.tsx`: Size always renders; position group appears only
  for absolute/fixed; relative/sticky retain the four-inset path; X/Y route to
  the correct selected side; Stretch exposes paired insets; control state
  refreshes after a position or anchor edit.
- Extend `valuePolicy` and nudge tests for all six dimension properties and
  assert that aspect ratio is never nudged as a bare length.

### Browser tests (Playwright)

Extend `examples/sandbox/tests/m2-layout-section.dev.spec.ts`:

1. Select `sizing-box`, change width using bare `240`, select `16 / 9`, and
   set max-height to `40vh`; assert computed values, the managed rule, and
   Change Log entries.
2. Select `right-anchored-box`, edit X and Y; assert `right` and `bottom`
   changed while `left` and `top` remain `auto`.
3. Switch its horizontal anchor to Left; assert the same rendered horizontal
   offset moves to `left`, `right: auto` is projected, and one Undo restores
   the original two-side state.
4. Select `stretched-box`; assert both horizontal insets are visible and no
   ambiguous single X input is offered.
5. Re-render the sandbox after an edit and assert rules still apply, preserving
   the managed-stylesheet contract.

Run the normal project gate after implementation:

```sh
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm --filter sandbox playwright test examples/sandbox/tests/m2-layout-section.dev.spec.ts
pnpm --filter sandbox build
```

The production build check remains required even though this work changes only
inspector code: it proves the ADR-0002 dev-only contract still holds.

## Out of scope

- Grid sizing/placement, logical `inset-*` properties, CSS anchor positioning,
  and container-query units.
- Drag handles, direct manipulation, or transform-based centering.
- Rewriting shorthand declarations (`inset`, `width`-related shorthands) or
  removing author rules. This slice writes explicit physical longhands.
- Inferring an aspect ratio from a rendered rectangle or attempting to
  preserve intrinsic media sizing automatically.
- A full token-attribution model for dimensions; that follows the existing
  token-conformance approach when sizing tokens need dedicated UX.
