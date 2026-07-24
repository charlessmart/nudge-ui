# Grid layout controls

## Purpose

Add Grid as a first-class mode of the existing **Layout** editor. A designer
can choose `grid` or `inline-grid` from the existing Display dropdown, inspect
the effective grid container or child controls, and preview edits through the
managed stylesheet.

This plan deliberately changes the current conformance note that treats grid
templates as a deferred structured editor. It is not a claim that every CSS
Grid grammar will receive a visual builder. The first slice uses safe,
authored-value-preserving raw fields for grid grammar and small dropdowns only
where CSS has a closed keyword set.

The existing inspector contracts remain unchanged:

- All edits go through `setStyle()` and the managed
  `#design-tool-styles` stylesheet; never set an inline style.
- The selected element's `data-cid`/`data-src` selector remains the edit
  identity, change-log identity, and prompt fallback.
- The browser's computed result is evidence and preview only. It must not
  replace the CSS the page author actually wrote in an editable grid field.
- This is inspector-runtime work only and remains behind the existing
  dev-only boundary from ADR-0002.

## User experience

### Display selector and visibility

Extend `DISPLAY_OPTIONS` in `LayoutSection.tsx` with `grid` and `inline-grid`.
The existing `LayoutDropdown` keeps its current behaviour: the computed value
is selected initially, and a current value outside the standard list remains
available instead of being discarded.

| Section | When visible |
| --- | --- |
| Display + Position | Always, as today |
| Flex container | `display` is `flex` or `inline-flex` |
| Grid container | `display` is `grid` or `inline-grid` |
| Flex child | Parent display is `flex` or `inline-flex` |
| Grid child | Parent display is `grid` or `inline-grid` |
| Inset / Size | Existing rules; independent of Grid |

Changing Display to Grid must increment the same `layoutRevision` used by the
current Layout controls, so the Grid section appears immediately without
reselecting the element. Changing away from Grid must hide only Grid-specific
controls and preserve any grid edits in the change log for undo/revert.

### Grid container section

Place a **Grid** group beside the existing **Flex** group, using the same
`dt-layout__group`, compact controls, and revision patterns. The primary Grid
control is a compact visual track picker: its preview shows the current column
and row count, and clicking it opens a 12 × 8 cell matrix. Hovering previews a
selection; clicking commits both track definitions through the managed
stylesheet. This gives designers a visual way to understand and manipulate the
grid without creating a second layout surface or a full spreadsheet editor.

Keep the authored raw fields under an **Advanced grid CSS** disclosure. This
preserves arbitrary track grammar and lets users inspect or edit values that
cannot be represented by the picker, such as named lines, `subgrid`, `var()`,
and `calc()`.

| Control | CSS property | Control type | Initial scope |
| --- | --- | --- | --- |
| Columns | `grid-template-columns` | Visual picker + authored raw field | Picker writes explicit tracks; advanced field accepts any valid track-list text |
| Rows | `grid-template-rows` | Visual picker + authored raw field | Picker writes explicit tracks; advanced field accepts any valid track-list text |
| Auto flow | `grid-auto-flow` | Dropdown | `row`, `column`, `row dense`, `column dense` |
| Auto columns | `grid-auto-columns` | Authored raw track-list field | Any valid track-size text |
| Auto rows | `grid-auto-rows` | Authored raw track-list field | Any valid track-size text |
| Gap | `row-gap`, `column-gap` | Existing `LayoutComboField` | Reuse existing presets and raw entry |
| Content alignment | `justify-content`, `align-content` | Existing compact dropdown pattern | CSS Grid-supported values |
| Item alignment | `justify-items`, `align-items` | Existing compact dropdown pattern | CSS Grid-supported values |

The four track fields intentionally accept and preserve whole CSS values,
including `repeat(auto-fit, minmax(12rem, 1fr))`, named lines, `subgrid`,
`fit-content()`, `minmax()`, `var()`, and `calc()`. They receive no numeric
unit completion and no arrow-key nudge behaviour; both would corrupt a track
grammar. The input commits on blur or Enter and keeps an invalid draft visible
until it is corrected or cancelled with Escape.

`grid-template-areas`, the `grid` shorthand, and a graphical track/area
builder are out of the initial edit surface. If the authored CSS uses either
template areas or the shorthand, show a compact read-only **Advanced grid CSS**
summary with its authored declaration and source selector. Do not decompose or
rewrite it. A later slice can add a multiline template-area editor only after
its string grammar, validation, and preview behaviour have their own
conformance corpus.

### Grid child section

For an element whose parent is a grid container, show **Grid Child** below the
container group (when both apply) or below Display/Position.

| Control | CSS property | Control type |
| --- | --- | --- |
| Column placement | `grid-column` | Authored raw placement field |
| Row placement | `grid-row` | Authored raw placement field |
| Horizontal self alignment | `justify-self` | Dropdown |
| Vertical self alignment | `align-self` | Dropdown |

Placement fields retain valid values without attempting to split or infer
them: `2 / span 3`, `sidebar`, `content-start / content-end`, `auto`, and
`var(--card-column)` remain literal authored CSS. Individual
`grid-column-start`/`grid-column-end` and row longhands are deferred because
changing one side of an authored shorthand would need a deliberate edit model,
similar to the existing border-shorthand rules.

## Authored CSS parsing and value model

The current `LayoutDropdown` and `LayoutComboField` read through
`getStateStyleValue()`. In base state that intentionally returns
`getComputedStyle()`, which is suitable for simple enum controls but not for
Grid: browsers can serialize a grid template into used pixel track sizes and
therefore lose `repeat()`, `minmax()`, token references, and named lines.

Introduce a narrow layout-value reader rather than changing that behaviour for
all existing fields:

```ts
type LayoutValue = {
  property: string;
  authored: string | null;
  computed: string;
  sourceProperty?: string;
  selector?: string;
  confidence: "exact" | "probable" | "unknown";
};

getLayoutValue(element, property, state): LayoutValue;
```

It will:

1. Ask `getResolvedPropertiesForState()` for the active authored declaration
   and retain its `authored`/`declaredValue`, source property, selector, and
   cascade evidence.
2. Independently read `getElementComputedStyle()` for the preview value.
3. Prefer `authored` in the raw Grid fields; use `computed` only when no
   accessible, matching authored declaration exists. In that fallback, label
   the value **Computed — source unavailable** rather than presenting it as
   source CSS.
4. Refresh after every layout edit so a declaration written into the managed
   stylesheet becomes the immediately displayed authored value.

The existing `ResolvedProperty` model already distinguishes authored,
computed, source, and confidence. Grid should use this seam instead of adding
a one-off page stylesheet parser inside `LayoutSection`.

### Make source recovery safe for real page CSS

`getResolvedPropertiesForState()` currently walks real `document.styleSheets`
and uses CSSOM to find matching rules. Its raw author-text recovery is
intentionally simple and is not sufficient as a correctness boundary for
nested Grid functions or rules inside `@media`/`@layer` blocks. Before Grid
fields depend on it, replace that recovery path with a shared, brace-aware
source scanner for accessible `<style>` elements:

- scan declaration blocks while respecting quoted strings, escapes, comments,
  brackets, and nested parentheses/functions;
- split declarations only on top-level semicolons and the property/value pair
  only on a top-level colon;
- retain the exact value text for `CSSStyleRule` records, including
  `repeat()`, `minmax()`, named lines, string template areas, `var()`, and
  `!important`;
- walk nested grouping rules in the same order as CSSOM, pairing recovered
  blocks by rule path/source order rather than selector text alone (the same
  selector may validly occur in multiple media or layer blocks);
- use CSSOM serialization only for linked, constructed, or inaccessible
  stylesheets, and mark that fallback as probable/unknown rather than
  mislabelling it as authored text;
- preserve the current cascade rules for selector matching, active media and
  supports conditions, `!important`, layers, specificity, and source order.

This improves the resolver for every property; Grid is simply the first UI
that requires the stronger guarantee. `@container` rules remain conservative:
until their condition can be evaluated reliably, no declaration from an
unevaluable container query is claimed as the active authored winner. The
computed value remains available as the honest fallback.

### Edit and prompt behaviour

Each Grid field writes a single longhand through `setStyle()`. The managed
rule may override an author shorthand for preview, but the generated prompt
must retain both facts when available:

- the requested longhand change and before/after authored values; and
- the source declaration/property (for example, `grid`) when the page was
  originally authored with a shorthand.

No control writes `grid`, `grid-template`, or any source stylesheet directly.
Changes remain revertible property by property, project into Canvas previews,
and reapply after React renders under the existing managed-stylesheet contract.

## Component and module design

Keep `LayoutSection.tsx` as the visibility/orchestration point. Extract small
deep modules beside it:

```text
styleEditors/
  LayoutSection.tsx          # detects flex/grid container and child context
  GridSection.tsx            # container + child groups and control ordering
  GridPicker.tsx             # visual rows × columns picker and managed edit
  GridValueField.tsx         # authored raw CSS field, draft/commit/cancel UI
  gridValues.ts              # pure display/fallback and CSS-value helpers
tokens/
  resolution.ts              # shared CSSOM/source recovery, not Grid-specific
```

`GridValueField` receives a `LayoutValue`, `domElement`, property, revision,
and `onAfterEdit`. It owns no cascade traversal and calls `setStyle()` only on
commit. `GridSection` reads its container status from the selected element and
its child status from the parent via `getElementComputedStyle()`, exactly as
the current Flex section does. Add specific, stable test hooks such as
`layout-grid-container`, `layout-grid-child`, `layout-grid-template-columns`,
and `layout-grid-column`; do not make tests depend on incidental CSS classes.

## Sandbox fixtures and test plan

Extend the current Layout fixture in `examples/sandbox/src/App.tsx` and
`styles.css`; do not create a parallel test page.

| Fixture | Authored page CSS | Contract proved |
| --- | --- | --- |
| `grid-authored-container` | `display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); grid-template-rows: auto minmax(0, 1fr); gap: var(--space-4)` | Real CSS preserves authored track expressions instead of computed tracks. |
| `grid-cascade-container` | Same selector in a base rule and active `@media`/`@layer` rule, including an `!important` winner | Resolver chooses the page's active authored winner and records its source. |
| `grid-child-span` | Parent grid; `grid-column: 2 / span 3; grid-row: content-start / content-end` | Raw child placement survives reading and editing. |
| `grid-switch-target` | Initially `display: block` | Selecting Grid from the Display dropdown immediately reveals Grid controls and writes only a managed rule. |
| `grid-source-unavailable` | A constructed/inaccessible stylesheet fixture where practical | UI reports computed fallback honestly; it does not fabricate authored CSS. |

### Fast unit tests (Vitest)

- Source scanner cases for nested `repeat(minmax())`, quoted
  `grid-template-areas`, comments, custom-property fallbacks, `!important`,
  multiple identical selectors, and nested `@media`/`@layer` paths.
- `getLayoutValue()` cases prove authored and computed values stay distinct,
  the matching active-state declaration wins, and unavailable source produces
  a labelled computed fallback.
- `GridValueField` cases cover initial authored display, Enter/blur commits,
  Escape cancellation, invalid draft retention, and no length completion or
  keyboard nudge for a grid grammar.
- `GridPicker` cases cover explicit and computed track-count detection,
  keyboard-accessible cell selection, hover/selection preview, and writing
  both template longhands as one visual edit.
- `LayoutSection` cases cover `grid`/`inline-grid` visibility, parent-grid
  child controls, immediate refresh after a Display edit, and Grid/Flex
  sections never appearing for the wrong display type.
- Change-log/managed-sheet tests prove one Grid longhand is emitted under the
  stable `data-cid`/`data-src` selector and reverts cleanly.

### Browser tests (Playwright)

Extend `examples/sandbox/tests/m2-layout-section.dev.spec.ts` and add an
authored-value conformance test alongside the existing CSS fixtures:

1. Select `grid-authored-container` and assert the Shadow DOM field contains
   the exact `repeat(auto-fit, minmax(12rem, 1fr))` author text while the page
   reports a potentially different computed value.
2. Open the Grid preview, select a cell rectangle, and assert the displayed
   dimensions plus both managed template declarations update immediately.
3. Resize or use an active media fixture, then assert the field follows the
   winning actual page declaration rather than the first matching selector.
4. Select `grid-switch-target`, choose `grid` from
   `layout-select-display`, assert `layout-grid-container` appears, and verify
   the managed stylesheet contains `display: grid` under the selected stable
   selector.
5. Edit an advanced Columns value and a child `grid-column` value; assert their computed
   browser effects, managed rules, Change Log records, and individual reverts.
6. Re-render the sandbox after each kind of edit and confirm the preview still
   applies without inline styles.
7. Run the production sandbox build and assert the existing dev-only output
   contract still holds.

Run the project gate after implementation:

```sh
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm --filter sandbox playwright test examples/sandbox/tests/m2-layout-section.dev.spec.ts
pnpm --filter sandbox build
```

## Out of scope

- A drag-and-drop grid canvas, visual placement handles, or a spreadsheet-like
  track editor.
- Editing `grid`, `grid-template`, or `grid-template-areas` shorthands.
- Automatic conversion between explicit tracks, named areas, and implicit
  tracks.
- Source-file write-back or implementation of the generated prompt.
- Support for CSSOM-inaccessible author text beyond the explicitly labelled
  computed fallback.
